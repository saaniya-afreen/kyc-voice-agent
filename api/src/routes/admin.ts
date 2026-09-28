import { Router } from "express";
import { queryOne } from "../db.js";
import { env } from "../env.js";
import { resetCustomerTestData } from "../lib/resetTestData.js";

export const adminRouter = Router();

// GET /v1/admin/reset-test-customer?phone_number=+919901108427&secret=<AGENT_TOOL_SECRET>
// Wipes every kyc_refresh cycle (and dependent TIN/case rows) for one customer and
// puts them back to a clean, never-called kyc_status='due' baseline — for repeatedly
// re-testing the same test phone number without stale state (a locked-out or
// already-completed refresh) blocking the next call. Query-param secret (not a
// header) so it can be triggered straight from a browser address bar.
adminRouter.get("/reset-test-customer", async (req, res) => {
  if (req.query.secret !== env.agentToolSecret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const phoneNumber = req.query.phone_number;
  if (typeof phoneNumber !== "string" || !phoneNumber) {
    res.status(400).json({ error: "phone_number is required" });
    return;
  }

  const customer = await queryOne<{ id: string; full_name: string }>(
    "select id, full_name from kyc_customers where phone_e164 = $1",
    [phoneNumber]
  );
  if (!customer) {
    res.status(404).json({ error: `no customer on file for ${phoneNumber}` });
    return;
  }

  const deletedCount = await resetCustomerTestData(customer.id, "admin");

  res.json({
    reset: true,
    customer_id: customer.id,
    customer_name: customer.full_name,
    kyc_refresh_cycles_deleted: deletedCount,
  });
});
