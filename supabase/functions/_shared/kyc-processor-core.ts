// Classification core shared by the submit-kyc-screening endpoint (called explicitly
// by the agent's submit_kyc_screening tool) and the call-events webhook (which falls
// back to this when a call ends without the agent ever reaching that tool call — e.g.
// the platform's own post-call analysis already extracted the same fields).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit } from "./audit.ts";
import { encryptSsn } from "./crypto.ts";
import {
  classifyUc2,
  isStraightThrough,
  reviewYearsForRiskTier,
  type ScreeningPayload,
} from "./classify.ts";

const TERMINAL_REASONS = new Set(["consent_denied", "declaration_denied", "general_decline"]);

export interface ClassifyResult {
  status: number;
  body: Record<string, unknown>;
}

export async function runClassification(
  supabase: SupabaseClient,
  kycRefreshId: string,
  input: Record<string, unknown>
): Promise<ClassifyResult> {
  const { data: refresh, error: refreshError } = await supabase
    .from("kyc_refresh")
    .select("id, customer_id, call_status")
    .eq("id", kycRefreshId)
    .single();

  if (refreshError || !refresh) return { status: 404, body: { error: "kyc_refresh not found" } };

  if (refresh.call_status !== "calling" && refresh.call_status !== "pending") {
    return { status: 409, body: { error: `kyc_refresh is already ${refresh.call_status}` } };
  }

  if (typeof input.terminal_reason === "string" && TERMINAL_REASONS.has(input.terminal_reason)) {
    return handleTerminalReason(
      supabase,
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
    return handleTerminalReason(supabase, refresh.id, refresh.customer_id, "declaration_denied");
  }

  if (
    payload.is_resident_uae === undefined ||
    !Array.isArray(payload.tax_residencies) ||
    payload.has_us_indicia === undefined ||
    !payload.account_structure
  ) {
    return { status: 400, body: { error: "incomplete screening payload" } };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, risk_tier, employer, occupation, address, phone_e164")
    .eq("id", refresh.customer_id)
    .single();
  if (customerError || !customer) return { status: 404, body: { error: "customer not found" } };

  if (payload.activity_status === "dormant") {
    const nextReviewDate = addYears(reviewYearsForRiskTier(customer.risk_tier));
    await supabase
      .from("customers")
      .update({ activity_status: "dormant", kyc_status: "completed", next_review_date: nextReviewDate })
      .eq("id", customer.id);
    await supabase.from("kyc_refresh").update({ call_status: "completed", outcome_code: "UC-1.3" }).eq("id", refresh.id);
    await logAudit(supabase, {
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

    await supabase
      .from("customers")
      .update({
        ...Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.new])),
        kyc_status: "completed",
        next_review_date: nextReviewDate,
      })
      .eq("id", customer.id);

    const outcomeCode = profileChanged ? "UC-1.2" : "UC-1.1";
    await supabase
      .from("kyc_refresh")
      .update({ call_status: "completed", outcome_code: outcomeCode, consent_given: true })
      .eq("id", refresh.id);

    await logAudit(supabase, {
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

  const { count: tinExceptionCount } = await supabase
    .from("customer_tins")
    .select("id", { count: "exact", head: true })
    .eq("kyc_refresh_id", refresh.id)
    .eq("is_available", false);

  const uc2 = classifyUc2(payload, (tinExceptionCount ?? 0) > 0);

  let ssnEncrypted: Uint8Array | null = null;
  if (payload.has_us_indicia && payload.ssn) {
    ssnEncrypted = await encryptSsn(payload.ssn);
  }

  const { data: complianceCase, error: caseError } = await supabase
    .from("compliance_cases")
    .insert({
      customer_id: customer.id,
      kyc_refresh_id: refresh.id,
      escalation_reason: uc2.escalation_reason || "Escalated for manual review",
      material_change_type: uc2.material_change_type,
      required_documents: uc2.required_documents,
      ssn_encrypted: ssnEncrypted,
    })
    .select("id")
    .single();

  if (caseError) return { status: 500, body: { error: caseError.message } };

  await supabase.from("customers").update({ kyc_status: "escalated" }).eq("id", customer.id);
  await supabase
    .from("kyc_refresh")
    .update({ call_status: "escalated", outcome_code: uc2.outcome_code, consent_given: true })
    .eq("id", refresh.id);

  await logAudit(supabase, {
    customer_id: customer.id,
    kyc_refresh_id: refresh.id,
    event_type: "KYC_ESCALATED",
    actor: "voice_agent",
    new_data: { outcome_code: uc2.outcome_code, escalation_reason: uc2.escalation_reason },
  });

  return {
    status: 200,
    body: { outcome: "UC2_ESCALATED_TO_COMPLIANCE", outcome_code: uc2.outcome_code, compliance_case_id: complianceCase.id },
  };
}

async function handleTerminalReason(
  supabase: SupabaseClient,
  kycRefreshId: string,
  customerId: string,
  reason: "consent_denied" | "declaration_denied" | "general_decline"
): Promise<ClassifyResult> {
  if (reason === "consent_denied") {
    await supabase
      .from("kyc_refresh")
      .update({ call_status: "refused", outcome_code: "UC-D1", consent_given: false })
      .eq("id", kycRefreshId);
    await logAudit(supabase, { customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "CONSENT_DENIED", actor: "voice_agent" });
    return { status: 200, body: { outcome: "REFUSED", outcome_code: "UC-D1" } };
  }

  if (reason === "general_decline") {
    await supabase.from("kyc_refresh").update({ call_status: "declined", outcome_code: "UC-D4" }).eq("id", kycRefreshId);
    await logAudit(supabase, { customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "GENERAL_DECLINE", actor: "voice_agent" });
    return { status: 200, body: { outcome: "DECLINED", outcome_code: "UC-D4" } };
  }

  await supabase.from("kyc_refresh").update({ call_status: "declined", outcome_code: "UC-D3" }).eq("id", kycRefreshId);
  await supabase.from("customers").update({ kyc_status: "escalated" }).eq("id", customerId);
  const { data: complianceCase } = await supabase
    .from("compliance_cases")
    .insert({
      customer_id: customerId,
      kyc_refresh_id: kycRefreshId,
      escalation_reason: "Customer declined to make the required regulatory declaration",
      required_documents: [],
    })
    .select("id")
    .single();
  await logAudit(supabase, { customer_id: customerId, kyc_refresh_id: kycRefreshId, event_type: "DECLARATION_DENIED", actor: "voice_agent" });
  return { status: 200, body: { outcome: "DECLINED", outcome_code: "UC-D3", compliance_case_id: complianceCase?.id } };
}

function addYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}
