import { Router } from "express";
import { pool, queryOne } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { runClassification } from "../lib/kycProcessor.js";
import { requireToolSecret } from "../middleware/auth.js";

export const toolsRouter = Router();
toolsRouter.use(requireToolSecret);

const MAX_AUTH_ATTEMPTS = 3;

// POST /v1/start-kyc-call
// Call this first, before anything else, on every call — whether it was dispatched via
// /v1/trigger-outbound-call or placed manually from your voice platform. Looks the
// customer up by the number being dialed and opens (or resumes) their refresh cycle,
// so the agent gets kyc_refresh_id + profile fields without needing platform-native
// dynamic variables wired up.
// Body: { phone_number } -> { kyc_refresh_id, customer_id, customer_name, employer,
//         occupation, address, risk_tier, attempts_used, max_attempts }
toolsRouter.post("/start-kyc-call", async (req, res) => {
  const { phone_number } = req.body ?? {};
  if (!phone_number) {
    res.status(400).json({ error: "phone_number is required" });
    return;
  }

  const customer = await queryOne<{
    id: string;
    full_name: string;
    employer: string | null;
    occupation: string | null;
    address: string | null;
    risk_tier: string;
  }>(
    "select id, full_name, employer, occupation, address, risk_tier from kyc_customers where phone_e164 = $1",
    [String(phone_number).trim()]
  );
  if (!customer) {
    res.status(404).json({ error: `no customer on file for ${phone_number}` });
    return;
  }

  let refresh = await queryOne<{ id: string; contact_attempts: number; max_attempts: number }>(
    `select id, contact_attempts, max_attempts from kyc_refresh
     where customer_id = $1 and call_status in ('pending', 'calling')
     order by created_at desc limit 1`,
    [customer.id]
  );

  if (!refresh) {
    refresh = await queryOne<{ id: string; contact_attempts: number; max_attempts: number }>(
      "insert into kyc_refresh (customer_id, trigger_source) values ($1, 'manual') returning id, contact_attempts, max_attempts",
      [customer.id]
    );
  }

  const nextAttempts = Math.min(refresh!.contact_attempts + 1, refresh!.max_attempts);
  await pool.query(
    "update kyc_refresh set contact_attempts = $2, auth_attempts = 0, call_status = 'calling', last_call_at = now() where id = $1",
    [refresh!.id, nextAttempts]
  );

  await logAudit({
    customer_id: customer.id,
    kyc_refresh_id: refresh!.id,
    event_type: "CALL_STARTED_MANUAL",
    actor: "voice_agent",
    new_data: { attempt: nextAttempts },
  });

  res.json({
    kyc_refresh_id: refresh!.id,
    customer_id: customer.id,
    customer_name: customer.full_name,
    employer: customer.employer,
    occupation: customer.occupation,
    address: customer.address,
    risk_tier: customer.risk_tier,
    attempts_used: nextAttempts,
    max_attempts: refresh!.max_attempts,
  });
});

// POST /v1/verify-account
// Body: { kyc_refresh_id, digit_number, dob } -> { authenticated, customer_name, attempts_remaining, locked_out }
toolsRouter.post("/verify-account", async (req, res) => {
  const { kyc_refresh_id, digit_number, dob } = req.body ?? {};
  if (!kyc_refresh_id || !digit_number || !dob) {
    res.status(400).json({ error: "kyc_refresh_id, digit_number and dob are required" });
    return;
  }

  const refresh = await queryOne<{ id: string; customer_id: string; auth_attempts: number; call_status: string }>(
    "select id, customer_id, auth_attempts, call_status from kyc_refresh where id = $1",
    [kyc_refresh_id]
  );
  if (!refresh) {
    res.status(404).json({ error: "kyc_refresh not found" });
    return;
  }
  if (refresh.call_status === "failed") {
    res.json({ authenticated: false, customer_name: null, attempts_remaining: 0, locked_out: true });
    return;
  }

  const customer = await queryOne<{ id: string; full_name: string; account_number: string; date_of_birth: string }>(
    "select id, full_name, account_number, date_of_birth::text as date_of_birth from kyc_customers where id = $1",
    [refresh.customer_id]
  );
  if (!customer) {
    res.status(404).json({ error: "customer not found" });
    return;
  }

  const accountLast4 = customer.account_number.slice(-4);
  const digitsMatch = String(digit_number).trim() === accountLast4;
  const dobMatch = customer.date_of_birth === dob;
  const authenticated = digitsMatch && dobMatch;

  const nextAttempts = refresh.auth_attempts + 1;
  const attemptsRemaining = Math.max(0, MAX_AUTH_ATTEMPTS - nextAttempts);
  const lockedOut = !authenticated && nextAttempts >= MAX_AUTH_ATTEMPTS;

  if (lockedOut) {
    await pool.query(
      "update kyc_refresh set auth_attempts = $2, call_status = 'failed', outcome_code = 'UC-D2' where id = $1",
      [kyc_refresh_id, nextAttempts]
    );
  } else {
    await pool.query("update kyc_refresh set auth_attempts = $2 where id = $1", [kyc_refresh_id, nextAttempts]);
  }

  await logAudit({
    customer_id: customer.id,
    kyc_refresh_id,
    event_type: authenticated ? "AUTH_SUCCESS" : lockedOut ? "AUTH_LOCKED_OUT" : "AUTH_FAILURE",
    actor: "voice_agent",
    new_data: { digits_match: digitsMatch, dob_match: dobMatch, attempt: nextAttempts },
  });

  res.json({
    authenticated,
    customer_name: authenticated ? customer.full_name : null,
    attempts_remaining: attemptsRemaining,
    locked_out: lockedOut,
  });
});

// POST /v1/uc2-get-next-crs-country
// Body: { kyc_refresh_id, tax_residencies[] } -> { next_country_code, is_finished, remaining_count }
toolsRouter.post("/uc2-get-next-crs-country", async (req, res) => {
  const { kyc_refresh_id, tax_residencies } = req.body ?? {};
  if (!kyc_refresh_id || !Array.isArray(tax_residencies)) {
    res.status(400).json({ error: "kyc_refresh_id and tax_residencies[] are required" });
    return;
  }

  const recorded = await pool.query<{ country_code: string }>(
    "select country_code from kyc_customer_tins where kyc_refresh_id = $1",
    [kyc_refresh_id]
  );
  const done = new Set(recorded.rows.map((r) => r.country_code.toUpperCase()));
  const remaining = (tax_residencies as string[])
    .map((c) => c.toUpperCase())
    .filter((c) => c !== "AE" && !done.has(c));

  res.json({
    next_country_code: remaining[0] ?? null,
    is_finished: remaining.length === 0,
    remaining_count: remaining.length,
  });
});

// POST /v1/uc2-store-tin-value
// Body: { kyc_refresh_id, country_code, tin_value } -> { success }
toolsRouter.post("/uc2-store-tin-value", async (req, res) => {
  const { kyc_refresh_id, country_code, tin_value } = req.body ?? {};
  if (!kyc_refresh_id || !country_code || !tin_value) {
    res.status(400).json({ error: "kyc_refresh_id, country_code and tin_value are required" });
    return;
  }

  const refresh = await queryOne<{ customer_id: string }>("select customer_id from kyc_refresh where id = $1", [kyc_refresh_id]);
  if (!refresh) {
    res.status(404).json({ error: "kyc_refresh not found" });
    return;
  }

  await pool.query(
    `insert into kyc_customer_tins (customer_id, kyc_refresh_id, country_code, tin_value, is_available, reason_code, reason_explanation)
     values ($1, $2, $3, $4, true, null, null)
     on conflict (kyc_refresh_id, country_code)
     do update set tin_value = excluded.tin_value, is_available = true, reason_code = null, reason_explanation = null`,
    [refresh.customer_id, kyc_refresh_id, String(country_code).toUpperCase(), tin_value]
  );

  await logAudit({
    customer_id: refresh.customer_id,
    kyc_refresh_id,
    event_type: "TIN_RECORDED",
    actor: "voice_agent",
    new_data: { country_code: String(country_code).toUpperCase() }, // never log the TIN value itself
  });

  res.json({ success: true });
});

// POST /v1/uc2-store-tin-reason
// Body: { kyc_refresh_id, country_code, reason_code: "A"|"B"|"C", reason_explanation? } -> { success }
toolsRouter.post("/uc2-store-tin-reason", async (req, res) => {
  const { kyc_refresh_id, country_code, reason_code, reason_explanation } = req.body ?? {};
  if (!kyc_refresh_id || !country_code || !["A", "B", "C"].includes(reason_code)) {
    res.status(400).json({ error: "kyc_refresh_id, country_code and reason_code (A|B|C) are required" });
    return;
  }

  const refresh = await queryOne<{ customer_id: string }>("select customer_id from kyc_refresh where id = $1", [kyc_refresh_id]);
  if (!refresh) {
    res.status(404).json({ error: "kyc_refresh not found" });
    return;
  }

  await pool.query(
    `insert into kyc_customer_tins (customer_id, kyc_refresh_id, country_code, tin_value, is_available, reason_code, reason_explanation)
     values ($1, $2, $3, null, false, $4, $5)
     on conflict (kyc_refresh_id, country_code)
     do update set tin_value = null, is_available = false, reason_code = excluded.reason_code, reason_explanation = excluded.reason_explanation`,
    [refresh.customer_id, kyc_refresh_id, String(country_code).toUpperCase(), reason_code, reason_explanation ?? null]
  );

  await logAudit({
    customer_id: refresh.customer_id,
    kyc_refresh_id,
    event_type: "TIN_EXCEPTION_RECORDED",
    actor: "voice_agent",
    new_data: { country_code: String(country_code).toUpperCase(), reason_code },
  });

  res.json({ success: true });
});

// POST /v1/submit-kyc-screening
// Either { kyc_refresh_id, terminal_reason } or the full screening payload — see docs/architecture.md
toolsRouter.post("/submit-kyc-screening", async (req, res) => {
  const { kyc_refresh_id } = req.body ?? {};
  if (!kyc_refresh_id) {
    res.status(400).json({ error: "kyc_refresh_id is required" });
    return;
  }
  const result = await runClassification(kyc_refresh_id, req.body);
  res.status(result.status).json(result.body);
});
