// POST /retell-outbound-call
// Dispatches one outbound call for a customer's current (or a new) refresh cycle.
// Called manually from the dashboard's "Trigger Call" button, or by whatever
// scheduler you point at customers with next_review_date <= today.
//
// Body: { customer_id: string, trigger_source?: "manual" | "scheduled" }
// -> { kyc_refresh_id, provider_call_id, attempt, attempts_remaining }
import { serviceClient } from "../_shared/supabase.ts";
import { logAudit } from "../_shared/audit.ts";
import { dispatchOutboundCall } from "../_shared/oneinbox.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = serviceClient();
  const { customer_id, trigger_source } = await req.json();

  if (!customer_id) return jsonResponse({ error: "customer_id is required" }, 400);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, phone_e164, employer, occupation, address, risk_tier")
    .eq("id", customer_id)
    .single();
  if (customerError || !customer) return jsonResponse({ error: "customer not found" }, 404);

  // Reuse an already-open refresh cycle for this customer if one exists, otherwise start one.
  const { data: openRefresh } = await supabase
    .from("kyc_refresh")
    .select("id, contact_attempts, max_attempts")
    .eq("customer_id", customer_id)
    .eq("call_status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let refresh = openRefresh;
  if (!refresh) {
    const { data: created, error: createError } = await supabase
      .from("kyc_refresh")
      .insert({ customer_id, trigger_source: trigger_source === "scheduled" ? "scheduled" : "manual" })
      .select("id, contact_attempts, max_attempts")
      .single();
    if (createError) return jsonResponse({ error: createError.message }, 500);
    refresh = created;
  }

  if (refresh.contact_attempts >= refresh.max_attempts) {
    return jsonResponse({ error: "max contact attempts reached for this refresh cycle" }, 409);
  }

  const nextAttempt = refresh.contact_attempts + 1;
  await supabase
    .from("kyc_refresh")
    .update({ contact_attempts: nextAttempt, auth_attempts: 0, call_status: "calling", last_call_at: new Date().toISOString() })
    .eq("id", refresh.id);

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
      },
    });
    providerCallId = dispatched.providerCallId;
  } catch (err) {
    // Dispatch failed before the call ever rang — put the cycle back to pending so it
    // doesn't silently burn an attempt, and surface the error.
    await supabase
      .from("kyc_refresh")
      .update({ contact_attempts: refresh.contact_attempts, call_status: "pending" })
      .eq("id", refresh.id);
    return jsonResponse({ error: `dispatch failed: ${(err as Error).message}` }, 502);
  }

  await supabase.from("kyc_refresh").update({ retell_call_id: providerCallId }).eq("id", refresh.id);

  await logAudit(supabase, {
    customer_id: customer.id,
    kyc_refresh_id: refresh.id,
    event_type: "CALL_DISPATCHED",
    actor: "system",
    new_data: { attempt: nextAttempt, provider_call_id: providerCallId },
  });

  return jsonResponse({
    kyc_refresh_id: refresh.id,
    provider_call_id: providerCallId,
    attempt: nextAttempt,
    attempts_remaining: refresh.max_attempts - nextAttempt,
  });
});
