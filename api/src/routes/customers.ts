import { Router } from "express";
import { pool, queryOne } from "../db.js";
import { requireOfficer } from "../middleware/auth.js";

export const customersRouter = Router();
customersRouter.use(requireOfficer);

// GET /v1/customers?risk_tier=&kyc_status=&due_before=YYYY-MM-DD
// Worklist view: each customer plus their latest refresh cycle (or null if never called).
customersRouter.get("/", async (req, res) => {
  const { risk_tier, kyc_status, due_before } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (risk_tier) {
    params.push(risk_tier);
    conditions.push(`c.risk_tier = $${params.length}`);
  }
  if (kyc_status) {
    params.push(kyc_status);
    conditions.push(`c.kyc_status = $${params.length}`);
  }
  if (due_before) {
    params.push(due_before);
    conditions.push(`c.next_review_date <= $${params.length}`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const { rows } = await pool.query(
    `select c.*,
            r.id as refresh_id, r.contact_attempts, r.max_attempts, r.call_status, r.outcome_code, r.created_at as refresh_created_at
     from kyc_customers c
     left join lateral (
       select * from kyc_refresh where customer_id = c.id order by created_at desc limit 1
     ) r on true
     ${where}
     order by c.next_review_date asc nulls last
     limit 200`,
    params
  );

  res.json(
    rows.map((row: any) => ({
      id: row.id,
      full_name: row.full_name,
      phone_e164: row.phone_e164,
      account_number: row.account_number,
      date_of_birth: row.date_of_birth,
      email: row.email,
      employer: row.employer,
      occupation: row.occupation,
      address: row.address,
      risk_tier: row.risk_tier,
      kyc_status: row.kyc_status,
      activity_status: row.activity_status,
      next_review_date: row.next_review_date,
      created_at: row.created_at,
      latest_refresh: row.refresh_id
        ? {
            id: row.refresh_id,
            contact_attempts: row.contact_attempts,
            max_attempts: row.max_attempts,
            call_status: row.call_status,
            outcome_code: row.outcome_code,
            created_at: row.refresh_created_at,
          }
        : null,
    }))
  );
});

// GET /v1/customers/:id — profile + refresh history + latest cycle's TINs + audit trail
customersRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const customer = await queryOne("select * from kyc_customers where id = $1", [id]);
  if (!customer) {
    res.status(404).json({ error: "customer not found" });
    return;
  }

  const refreshes = await pool.query("select * from kyc_refresh where customer_id = $1 order by created_at desc", [id]);
  const latestRefreshId = refreshes.rows[0]?.id ?? null;
  const tins = latestRefreshId
    ? (await pool.query("select * from kyc_customer_tins where kyc_refresh_id = $1", [latestRefreshId])).rows
    : [];
  const auditLogs = await pool.query("select * from kyc_audit_logs where customer_id = $1 order by created_at desc", [id]);

  res.json({ ...customer, refreshes: refreshes.rows, tins, audit_logs: auditLogs.rows });
});
