// POST /verify-account
// In-call 2FA. The agent calls this once per attempt; after 3 failed
// attempts on the same kyc_refresh (one call cycle) it auto-fails as UC-D2.
//
// Body: { kyc_refresh_id: string, digit_number: string, dob: string }
// -> { authenticated: boolean, customer_name: string | null, attempts_remaining: number, locked_out: boolean }
import { serviceClient } from "../_shared/supabase.ts";
import { logAudit } from "../_shared/audit.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireToolSecret } from "../_shared/auth.ts";

const MAX_AUTH_ATTEMPTS = 3;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const authError = requireToolSecret(req);
  if (authError) return authError;

  const supabase = serviceClient();
  const { kyc_refresh_id, digit_number, dob } = await req.json();

  if (!kyc_refresh_id || !digit_number || !dob) {
    return jsonResponse({ error: "kyc_refresh_id, digit_number and dob are required" }, 400);
  }

  const { data: refresh, error: refreshError } = await supabase
    .from("kyc_refresh")
    .select("id, customer_id, auth_attempts, call_status")
    .eq("id", kyc_refresh_id)
    .single();

  if (refreshError || !refresh) {
    return jsonResponse({ error: "kyc_refresh not found" }, 404);
  }

  if (refresh.call_status === "failed") {
    return jsonResponse({ authenticated: false, customer_name: null, attempts_remaining: 0, locked_out: true });
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, account_number, date_of_birth")
    .eq("id", refresh.customer_id)
    .single();

  if (customerError || !customer) {
    return jsonResponse({ error: "customer not found" }, 404);
  }

  const accountLast4 = customer.account_number.slice(-4);
  const digitsMatch = digit_number.trim() === accountLast4;
  const dobMatch = customer.date_of_birth === dob;
  const authenticated = digitsMatch && dobMatch;

  const nextAttempts = refresh.auth_attempts + 1;
  const attemptsRemaining = Math.max(0, MAX_AUTH_ATTEMPTS - nextAttempts);
  const lockedOut = !authenticated && nextAttempts >= MAX_AUTH_ATTEMPTS;

  await supabase
    .from("kyc_refresh")
    .update({
      auth_attempts: nextAttempts,
      ...(lockedOut ? { call_status: "failed", outcome_code: "UC-D2" } : {}),
    })
    .eq("id", kyc_refresh_id);

  await logAudit(supabase, {
    customer_id: customer.id,
    kyc_refresh_id,
    event_type: authenticated ? "AUTH_SUCCESS" : lockedOut ? "AUTH_LOCKED_OUT" : "AUTH_FAILURE",
    actor: "voice_agent",
    new_data: { digits_match: digitsMatch, dob_match: dobMatch, attempt: nextAttempts },
  });

  return jsonResponse({
    authenticated,
    customer_name: authenticated ? customer.full_name : null,
    attempts_remaining: attemptsRemaining,
    locked_out: lockedOut,
  });
});
