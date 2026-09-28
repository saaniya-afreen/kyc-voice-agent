// Classification core shared by the submit-kyc-screening route (called explicitly by
// the agent's submit_kyc_screening / end_call_early tools) and the call-events webhook
// (which falls back to this when a call ends without the agent ever reaching that tool
// — e.g. the platform's own post-call analysis already extracted the same fields).
import { pool, queryOne } from "../db.js";
import { logAudit } from "./audit.js";
import { encryptSsn } from "./crypto.js";
import { classifyUc2, isStraightThrough, reviewYearsForRiskTier, type ScreeningPayload } from "./classify.js";

const TERMINAL_REASONS = new Set(["consent_denied", "declaration_denied", "general_decline"]);

export interface ClassifyResult {
  status: number;
  body: Record<string, unknown>;
}

interface RefreshRow {
  id: string;
  customer_id: string;
  call_status: string;
}

export async function runClassification(kycRefreshId: string, input: Record<string, unknown>): Promise<ClassifyResult> {
  const refresh = await queryOne<RefreshRow>(
    "select id, customer_id, call_status from kyc_refresh where id = $1",
    [kycRefreshId]
  );
  if (!refresh) return { status: 404, body: { error: "kyc_refresh not found" } };

  if (refresh.call_status !== "calling" && refresh.call_status !== "pending") {
    return { status: 409, body: { error: `kyc_refresh is already ${refresh.call_status}` } };
  }

  if (typeof input.terminal_reason === "string" && TERMINAL_REASONS.has(input.terminal_reason)) {
    return handleTerminalReason(
      refresh.id,
      refresh.customer_id,
      input.terminal_reason as "consent_denied" | "declaration_denied" | "general_decline"
    );
  }

  const payload = input as unknown as ScreeningPayload & {
    ssn?: string;
    activity_status?: "active" | "dormant";
    profile_updates?: Record<string, string>;
  };

  if (payload.declaration_confirmed === false) {
    return handleTerminalReason(refresh.id, refresh.customer_id, "declaration_denied");
  }

  if (
    payload.is_resident_uae === undefined ||
    !Array.isArray(payload.tax_residencies) ||
    payload.has_us_indicia === undefined ||
    !payload.account_structure
  ) {
    return { status: 400, body: { error: "incomplete screening payload" } };
  }

  const customer = await queryOne<{
    id: string;
    risk_tier: "low" | "medium" | "high";
    employer: string | null;
    occupation: string | null;
    address: string | null;
    phone_e164: string | null;
  }>("select id, risk_tier, employer, occupation, address, phone_e164 from kyc_customers where id = $1", [refresh.customer_id]);
  if (!customer) return { status: 404, body: { error: "customer not found" } };

  if (payload.activity_status === "dormant") {
    const nextReviewDate = addYears(reviewYearsForRiskTier(customer.risk_tier));
    await pool.query(
      "update kyc_customers set activity_status = 'dormant', kyc_status = 'completed', next_review_date = $2 where id = $1",
      [customer.id, nextReviewDate]
    );
    await pool.query("update kyc_refresh set call_status = 'completed', outcome_code = 'UC-1.3' where id = $1", [refresh.id]);
    await logAudit({
      customer_id: customer.id,
      kyc_refresh_id: refresh.id,
      event_type: "KYC_COMPLETED_DORMANT",
      actor: "voice_agent",
      new_data: { outcome_code: "UC-1.3" },
    });
    return { status: 200, body: { outcome: "UC1_AUTO_COMPLETED", outcome_code: "UC-1.3", next_review_date: nextReviewDate } };
  }

  if (isStraightThrough(payload)) {
    const updates = payload.profile_updates ?? {};
    const diff: Record<string, { old: string | null; new: string }> = {};
    for (const [key, value] of Object.entries(updates)) {
      const current = (customer as Record<string, unknown>)[key];
      if (value && value !== current) diff[key] = { old: (current as string) ?? null, new: value };
    }
    const profileChanged = Object.keys(diff).length > 0;
    const nextReviewDate = addYears(reviewYearsForRiskTier(customer.risk_tier));

    const setClauses = Object.keys(diff).map((k, i) => `${k} = $${i + 3}`);
    const setValues = Object.values(diff).map((v) => v.new);
    await pool.query(
      `update kyc_customers set kyc_status = 'completed', next_review_date = $2 ${setClauses.length ? "," + setClauses.join(", ") : ""} where id = $1`,
      [customer.id, nextReviewDate, ...setValues]
    );

    const outcomeCode = profileChanged ? "UC-1.2" : "UC-1.1";
    await pool.query(
      "update kyc_refresh set call_status = 'completed', outcome_code = $2, consent_given = true where id = $1",
      [refresh.id, outcomeCode]
    );

    await logAudit({
      customer_id: customer.id,
      kyc_refresh_id: refresh.id,
      event_type: profileChanged ? "KYC_COMPLETED_PROFILE_UPDATE" : "KYC_COMPLETED_STP",
      actor: "voice_agent",
      old_data: profileChanged ? Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.old])) : null,
      new_data: profileChanged
        ? Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.new]))
        : { outcome_code: outcomeCode },
    });

    return { status: 200, body: { outcome: "UC1_AUTO_COMPLETED", outcome_code: outcomeCode, next_review_date: nextReviewDate } };
  }

  const tinExceptionRows = await pool.query(
    "select 1 from kyc_customer_tins where kyc_refresh_id = $1 and is_available = false limit 1",
    [refresh.id]
  );
  const uc2 = classifyUc2(payload, tinExceptionRows.rowCount! > 0);

  let ssnEncrypted: Buffer | null = null;
  if (payload.has_us_indicia && payload.ssn) {
    ssnEncrypted = encryptSsn(payload.ssn);
  }

  const caseResult = await pool.query<{ id: string }>(
    `insert into kyc_compliance_cases (customer_id, kyc_refresh_id, escalation_reason, material_change_type, required_documents, ssn_encrypted)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      customer.id,
      refresh.id,
      uc2.escalation_reason || "Escalated for manual review",
      uc2.material_change_type,
      uc2.required_documents,
      ssnEncrypted,
    ]
  );

  await pool.query("update kyc_customers set kyc_status = 'escalated' where id = $1", [customer.id]);
  await pool.query(
    "update kyc_refresh set call_status = 'escalated', outcome_code = $2, consent_given = true where id = $1",
    [refresh.id, uc2.outcome_code]
  );

  await logAudit({
    customer_id: customer.id,
    kyc_refresh_id: refresh.id,
    event_type: "KYC_ESCALATED",
    actor: "voice_agent",
    new_data: { outcome_code: uc2.outcome_code, escalation_reason: uc2.escalation_reason },
  });

  return {
    status: 200,
    body: { outcome: "UC2_ESCALATED_TO_COMPLIANCE", outcome_code: uc2.outcome_code, compliance_case_id: caseResult.rows[0]!.id },
  };
}

async function handleTerminalReason(
  kycRefreshId: string,
  customerId: string,
  reason: "consent_denied" | "declaration_denied" | "general_decline"
): Promise<ClassifyResult> {
  if (reason === "consent_denied") {
    await pool.query(
      "update kyc_refresh set call_status = 'refused', outcome_code = 'UC-D1', consent_given = false where id = $1",
      [kycRefreshId]
    );
    await logAudit({ customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "CONSENT_DENIED", actor: "voice_agent" });
    return { status: 200, body: { outcome: "REFUSED", outcome_code: "UC-D1" } };
  }

  if (reason === "general_decline") {
    await pool.query("update kyc_refresh set call_status = 'declined', outcome_code = 'UC-D4' where id = $1", [kycRefreshId]);
    await logAudit({ customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "GENERAL_DECLINE", actor: "voice_agent" });
    return { status: 200, body: { outcome: "DECLINED", outcome_code: "UC-D4" } };
  }

  await pool.query("update kyc_refresh set call_status = 'declined', outcome_code = 'UC-D3' where id = $1", [kycRefreshId]);
  await pool.query("update kyc_customers set kyc_status = 'escalated' where id = $1", [customerId]);
  const caseResult = await pool.query<{ id: string }>(
    `insert into kyc_compliance_cases (customer_id, kyc_refresh_id, escalation_reason, required_documents)
     values ($1, $2, $3, '{}') returning id`,
    [customerId, kycRefreshId, "Customer declined to make the required regulatory declaration"]
  );
  await logAudit({ customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "DECLARATION_DENIED", actor: "voice_agent" });
  return { status: 200, body: { outcome: "DECLINED", outcome_code: "UC-D3", compliance_case_id: caseResult.rows[0]!.id } };
}

function addYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0]!;
}
