import { Router } from "express";
import { pool, queryOne } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { dispatchOutboundCall } from "../lib/voicePlatform.js";
import { requireOfficer } from "../middleware/auth.js";

export const callsRouter = Router();
callsRouter.use(requireOfficer);

// POST /v1/trigger-outbound-call
// Dispatches one outbound call for a customer's current (or a new) refresh cycle.
// Body: { customer_id } -> { kyc_refresh_id, provider_call_id, attempt, attempts_remaining }
callsRouter.post("/", async (req, res) => {
  const { customer_id, trigger_source } = req.body ?? {};
  if (!customer_id) {
    res.status(400).json({ error: "customer_id is required" });
    return;
  }

  const customer = await queryOne<{
    id: string;
    full_name: string;
    phone_e164: string;
    employer: string | null;
    occupation: string | null;
    address: string | null;
    risk_tier: string;
  }>("select id, full_name, phone_e164, employer, occupation, address, risk_tier from kyc_customers where id = $1", [customer_id]);
  if (!customer) {
    res.status(404).json({ error: "customer not found" });
    return;
  }

  let refresh = await queryOne<{ id: string; contact_attempts: number; max_attempts: number }>(
    `select id, contact_attempts, max_attempts from kyc_refresh
     where customer_id = $1 and call_status = 'pending'
     order by created_at desc limit 1`,
    [customer_id]
  );

  if (!refresh) {
    refresh = await queryOne<{ id: string; contact_attempts: number; max_attempts: number }>(
      `insert into kyc_refresh (customer_id, trigger_source) values ($1, $2)
       returning id, contact_attempts, max_attempts`,
      [customer_id, trigger_source === "scheduled" ? "scheduled" : "manual"]
    );
  }

  if (!refresh || refresh.contact_attempts >= refresh.max_attempts) {
    res.status(409).json({ error: "max contact attempts reached for this refresh cycle" });
    return;
  }

  const nextAttempt = refresh.contact_attempts + 1;
  await pool.query(
    "update kyc_refresh set contact_attempts = $2, auth_attempts = 0, call_status = 'calling', last_call_at = now() where id = $1",
    [refresh.id, nextAttempt]
  );

  let providerCallId: string;
  try {
    const dispatched = await dispatchOutboundCall({
      toNumber: customer.phone_e164,
      metadata: { kyc_refresh_id: refresh.id, customer_id: customer.id },
      dynamicVariables: {
        customer_name: customer.full_name,
        customer_id: customer.id,
        employer: customer.employer,
        occupation: customer.occupation,
        address: customer.address,
        risk_tier: customer.risk_tier,
        kyc_refresh_id: refresh.id,
      },
    });
    providerCallId = dispatched.providerCallId;
  } catch (err) {
    // Dispatch failed before the call ever rang — put the cycle back to pending so it
    // doesn't silently burn an attempt, and surface the error.
    await pool.query("update kyc_refresh set contact_attempts = $2, call_status = 'pending' where id = $1", [
      refresh.id,
      refresh.contact_attempts,
    ]);
    res.status(502).json({ error: `dispatch failed: ${(err as Error).message}` });
    return;
  }

  await pool.query("update kyc_refresh set provider_call_id = $2 where id = $1", [refresh.id, providerCallId]);

  await logAudit({
    customer_id: customer.id,
    kyc_refresh_id: refresh.id,
    event_type: "CALL_DISPATCHED",
    actor: "system",
    new_data: { attempt: nextAttempt, provider_call_id: providerCallId },
  });

  res.json({
    kyc_refresh_id: refresh.id,
    provider_call_id: providerCallId,
    attempt: nextAttempt,
    attempts_remaining: refresh.max_attempts - nextAttempt,
  });
});
