import { Router } from "express";
import { pool } from "../db.js";
import { requireOfficer } from "../middleware/auth.js";

export const overviewRouter = Router();
overviewRouter.use(requireOfficer);

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

// GET /v1/overview — KPI cards, funnel stages, and a preview of pending compliance cases
overviewRouter.get("/", async (_req, res) => {
  const [
    totalUniverse,
    dueForReview,
    inProgress,
    autoCompleted,
    pendingReview,
    contacted,
    authenticated,
    completed,
    escalated,
    exceptions,
  ] = await Promise.all([
    count("select count(*) from kyc_customers"),
    count("select count(*) from kyc_customers where kyc_status = 'due'"),
    count("select count(*) from kyc_refresh where call_status = 'calling'"),
    count("select count(*) from kyc_refresh where outcome_code in ('UC-1.1','UC-1.2','UC-1.3')"),
    count("select count(*) from kyc_compliance_cases where case_status = 'pending_review'"),
    count("select count(*) from kyc_refresh where contact_attempts > 0"),
    count("select count(*) from kyc_refresh where auth_attempts > 0"),
    count("select count(*) from kyc_refresh where call_status = 'completed'"),
    count("select count(*) from kyc_refresh where call_status = 'escalated'"),
    pool.query(
      `select cc.*, row_to_json(c.*) as customer
       from kyc_compliance_cases cc
       join kyc_customers c on c.id = cc.customer_id
       where cc.case_status = 'pending_review'
       order by cc.created_at desc
       limit 5`
    ),
  ]);

  res.json({
    kpis: { totalUniverse, dueForReview, inProgress, autoCompleted, pendingReview },
    funnel: [
      { stage: "Due", count: dueForReview },
      { stage: "Contacted", count: contacted },
      { stage: "Authenticated", count: authenticated },
      { stage: "Completed", count: completed },
      { stage: "Escalated", count: escalated },
    ],
    pending_cases: exceptions.rows,
  });
});
