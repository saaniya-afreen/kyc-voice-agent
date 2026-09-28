// POST /retell-events
// Webhook receiver for call lifecycle events from the voice platform.
// Configure this as the platform's webhook URL for the KYC agent.
//
// Body: { event: "call_started" | "call_ended" | "call_analyzed", call: {
//   call_id, recording_url?, transcript?, disconnection_reason?,
//   metadata?: { kyc_refresh_id }, call_analysis?: { custom_analysis_data?: Record<string, unknown> }
// } }
//
// If WEBHOOK_SHARED_SECRET is set, requests must carry it in X-Webhook-Secret.
import { serviceClient } from "../_shared/supabase.ts";
import { logAudit } from "../_shared/audit.ts";
import { runClassification } from "../_shared/kyc-processor-core.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const expectedSecret = Deno.env.get("WEBHOOK_SHARED_SECRET");
  if (expectedSecret && req.headers.get("x-webhook-secret") !== expectedSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = serviceClient();
  const body = await req.json();
  const call = body.call ?? {};
  const event = body.event as string;

  const kycRefreshId: string | undefined = call.metadata?.kyc_refresh_id;
  let refresh;
  if (kycRefreshId) {
    ({ data: refresh } = await supabase
      .from("kyc_refresh")
      .select("id, customer_id, call_status, contact_attempts, max_attempts, outcome_code")
      .eq("id", kycRefreshId)
      .single());
  } else if (call.call_id) {
    ({ data: refresh } = await supabase
      .from("kyc_refresh")
      .select("id, customer_id, call_status, contact_attempts, max_attempts, outcome_code")
      .eq("retell_call_id", call.call_id)
      .single());
  }

  if (!refresh) return jsonResponse({ error: "no matching kyc_refresh for this call" }, 404);

  if (event === "call_started") {
    await supabase
      .from("kyc_refresh")
      .update({ retell_call_id: call.call_id, call_status: "calling", last_call_at: new Date().toISOString() })
      .eq("id", refresh.id);
    return jsonResponse({ ok: true });
  }

  if (event === "call_ended") {
    await supabase
      .from("kyc_refresh")
      .update({
        call_recording_url: call.recording_url ?? null,
        call_transcript: call.transcript ?? null,
        last_call_at: new Date().toISOString(),
      })
      .eq("id", refresh.id);

    const neverConnected = ["no_answer", "busy", "voicemail_reached", "dial_failed"].includes(
      call.disconnection_reason
    );
    if (refresh.call_status === "calling" && neverConnected) {
      const exhausted = refresh.contact_attempts >= refresh.max_attempts;
      await supabase
        .from("kyc_refresh")
        .update({ call_status: exhausted ? "failed" : "pending" })
        .eq("id", refresh.id);
      await logAudit(supabase, {
        customer_id: refresh.customer_id,
        kyc_refresh_id: refresh.id,
        event_type: exhausted ? "CALL_ATTEMPTS_EXHAUSTED" : "CALL_NO_CONNECT",
        actor: "system",
        new_data: { disconnection_reason: call.disconnection_reason, attempt: refresh.contact_attempts },
      });
    }
    return jsonResponse({ ok: true });
  }

  if (event === "call_analyzed") {
    // If the agent already classified this call mid-conversation, this is just extra
    // telemetry — never overwrite a terminal outcome.
    if (refresh.outcome_code || !["calling", "pending"].includes(refresh.call_status)) {
      return jsonResponse({ ok: true, skipped: "already classified" });
    }

    const data = call.call_analysis?.custom_analysis_data;
    if (!data || typeof data !== "object") return jsonResponse({ ok: true, skipped: "no analysis data" });

    let classifierInput: Record<string, unknown> | null = null;
    if (data.consent_given === false) {
      classifierInput = { terminal_reason: "consent_denied" };
    } else if (data.general_decline === true) {
      classifierInput = { terminal_reason: "general_decline" };
    } else if (data.declaration_confirmed === false) {
      classifierInput = { terminal_reason: "declaration_denied" };
    } else if (data.is_resident_uae !== undefined) {
      classifierInput = data;
    }

    if (!classifierInput) return jsonResponse({ ok: true, skipped: "insufficient analysis data" });

    const result = await runClassification(supabase, refresh.id, classifierInput);
    return jsonResponse({ ok: true, classification: result.body }, result.status);
  }

  return jsonResponse({ ok: true, skipped: `unhandled event ${event}` });
});
