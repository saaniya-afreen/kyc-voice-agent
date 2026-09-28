import { Router } from "express";
import { pool, queryOne } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { reviewYearsForRiskTier, type RiskTier } from "../lib/classify.js";
import { requireOfficer } from "../middleware/auth.js";

export const complianceCasesRouter = Router();
complianceCasesRouter.use(requireOfficer);

// GET /v1/compliance-cases?status=pending_review
complianceCasesRouter.get("/", async (req, res) => {
  const { status } = req.query as Record<string, string | undefined>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status && status !== "all") {
    params.push(status);
    conditions.push(`cc.case_status = $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await pool.query(
    `select cc.*,
            row_to_json(c.*) as customer,
            row_to_json(r.*) as kyc_refresh
     from kyc_compliance_cases cc
     join kyc_customers c on c.id = cc.customer_id
     left join kyc_refresh r on r.id = cc.kyc_refresh_id
     ${where}
     order by cc.created_at desc
     limit 200`,
    params
  );
  res.json(rows);
});

// GET /v1/compliance-cases/:id — includes collected TINs for the underlying refresh cycle
complianceCasesRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  const kase = await queryOne<Record<string, unknown>>(
    `select cc.*, row_to_json(c.*) as customer, row_to_json(r.*) as kyc_refresh
     from kyc_compliance_cases cc
     join kyc_customers c on c.id = cc.customer_id
     left join kyc_refresh r on r.id = cc.kyc_refresh_id
     where cc.id = $1`,
    [id]
  );
  if (!kase) {
    res.status(404).json({ error: "case not found" });
    return;
  }
  const refreshId = (kase.kyc_refresh as Record<string, unknown> | null)?.id as string | undefined;
  const tins = refreshId ? (await pool.query("select * from kyc_customer_tins where kyc_refresh_id = $1", [refreshId])).rows : [];
  res.json({ ...kase, tins });
});

// POST /v1/compliance-cases/:id/assign — assigns to the calling officer
complianceCasesRouter.post("/:id/assign", async (req, res) => {
  const { id } = req.params;
  const kase = await queryOne<{ customer_id: string; kyc_refresh_id: string | null }>(
    "select customer_id, kyc_refresh_id from kyc_compliance_cases where id = $1",
    [id]
  );
  if (!kase) {
    res.status(404).json({ error: "case not found" });
    return;
  }
  await pool.query("update kyc_compliance_cases set assigned_officer_id = $2 where id = $1", [id, req.officer!.sub]);
  await logAudit({
    customer_id: kase.customer_id,
    kyc_refresh_id: kase.kyc_refresh_id,
    event_type: "CASE_ASSIGNED",
    actor: req.officer!.email,
    new_data: { assigned_officer_id: req.officer!.sub },
  });
  res.json({ success: true });
});

// POST /v1/compliance-cases/:id/approve — { officer_notes? }
complianceCasesRouter.post("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { officer_notes } = req.body ?? {};
  const kase = await queryOne<{ customer_id: string; kyc_refresh_id: string | null }>(
    "select customer_id, kyc_refresh_id from kyc_compliance_cases where id = $1",
    [id]
  );
  if (!kase) {
    res.status(404).json({ error: "case not found" });
    return;
  }

  const customer = await queryOne<{ risk_tier: RiskTier }>("select risk_tier from kyc_customers where id = $1", [kase.customer_id]);
  const years = reviewYearsForRiskTier(customer?.risk_tier ?? "medium");
  const nextReviewDate = new Date();
  nextReviewDate.setFullYear(nextReviewDate.getFullYear() + years);

  await pool.query(
    "update kyc_compliance_cases set case_status = 'approved', reviewed_at = now(), officer_notes = coalesce($2, officer_notes) where id = $1",
    [id, officer_notes ?? null]
  );
  await pool.query("update kyc_customers set kyc_status = 'completed', next_review_date = $2 where id = $1", [
    kase.customer_id,
    nextReviewDate.toISOString().split("T")[0],
  ]);
  await logAudit({
    customer_id: kase.customer_id,
    kyc_refresh_id: kase.kyc_refresh_id,
    event_type: "CASE_APPROVED",
    actor: req.officer!.email,
    new_data: { officer_notes: officer_notes ?? null },
  });
  res.json({ success: true });
});

// POST /v1/compliance-cases/:id/manual-outreach — { officer_notes? }
complianceCasesRouter.post("/:id/manual-outreach", async (req, res) => {
  const { id } = req.params;
  const { officer_notes } = req.body ?? {};
  const kase = await queryOne<{ customer_id: string; kyc_refresh_id: string | null }>(
    "select customer_id, kyc_refresh_id from kyc_compliance_cases where id = $1",
    [id]
  );
  if (!kase) {
    res.status(404).json({ error: "case not found" });
    return;
  }

  await pool.query(
    "update kyc_compliance_cases set case_status = 'in_review', officer_notes = coalesce($2, officer_notes) where id = $1",
    [id, officer_notes ?? null]
  );
  await logAudit({
    customer_id: kase.customer_id,
    kyc_refresh_id: kase.kyc_refresh_id,
    event_type: "MANUAL_OUTREACH_REQUESTED",
    actor: req.officer!.email,
    new_data: { officer_notes: officer_notes ?? null },
  });
  res.json({ success: true });
});
