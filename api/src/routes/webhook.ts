import { Router } from "express";
import { pool, queryOne } from "../db.js";
import { logAudit } from "../lib/audit.js";
import { runClassification } from "../lib/kycProcessor.js";
import { requireWebhookSecret } from "../middleware/auth.js";

export const webhookRouter = Router();
webhookRouter.use(requireWebhookSecret);

interface RefreshRow {
  id: string;
  customer_id: string;
  call_status: string;
  contact_attempts: number;
  max_attempts: number;
  outcome_code: string | null;
}

// POST /v1/call-events
// Body: { event: "call_started" | "call_ended" | "call_analyzed", call: {
//   call_id, recording_url?, transcript?, disconnection_reason?,
//   metadata?: { kyc_refresh_id }, call_analysis?: { custom_analysis_data?: Record<string, unknown> }
// } }
webhookRouter.post("/", async (req, res) => {
  const body = req.body ?? {};
  const call = body.call ?? {};
  const event: string = body.event;

  const kycRefreshId: string | undefined = call.metadata?.kyc_refresh_id;
  let refresh: RefreshRow | null = null;
  if (kycRefreshId) {
    refresh = await queryOne<RefreshRow>(
      "select id, customer_id, call_status, contact_attempts, max_attempts, outcome_code from kyc_refresh where id = $1",
      [kycRefreshId]
    );
  } else if (call.call_id) {
    refresh = await queryOne<RefreshRow>(
      "select id, customer_id, call_status, contact_attempts, max_attempts, outcome_code from kyc_refresh where provider_call_id = $1",
      [call.call_id]
    );
  }

  if (!refresh) {
    res.status(404).json({ error: "no matching kyc_refresh for this call" });
    return;
  }

  if (event === "call_started") {
    await pool.query(
      "update kyc_refresh set provider_call_id = $2, call_status = 'calling', last_call_at = now() where id = $1",
      [refresh.id, call.call_id]
    );
    res.json({ ok: true });
    return;
  }

  if (event === "call_ended") {
    await pool.query(
      "update kyc_refresh set call_recording_url = $2, call_transcript = $3, last_call_at = now() where id = $1",
      [refresh.id, call.recording_url ?? null, call.transcript ?? null]
    );

    const neverConnected = ["no_answer", "busy", "voicemail_reached", "dial_failed"].includes(call.disconnection_reason);
    if (refresh.call_status === "calling" && neverConnected) {
      const exhausted = refresh.contact_attempts >= refresh.max_attempts;
      await pool.query("update kyc_refresh set call_status = $2 where id = $1", [refresh.id, exhausted ? "failed" : "pending"]);
      await logAudit({
        customer_id: refresh.customer_id,
        kyc_refresh_id: refresh.id,
        event_type: exhausted ? "CALL_ATTEMPTS_EXHAUSTED" : "CALL_NO_CONNECT",
        actor: "system",
        new_data: { disconnection_reason: call.disconnection_reason, attempt: refresh.contact_attempts },
      });
    }
    res.json({ ok: true });
    return;
  }

  if (event === "call_analyzed") {
    if (refresh.outcome_code || !["calling", "pending"].includes(refresh.call_status)) {
      res.json({ ok: true, skipped: "already classified" });
      return;
    }

    const data = call.call_analysis?.custom_analysis_data;
    if (!data || typeof data !== "object") {
      res.json({ ok: true, skipped: "no analysis data" });
      return;
    }

    let classifierInput: Record<string, unknown> | null = null;
    if (data.consent_given === false) classifierInput = { terminal_reason: "consent_denied" };
    else if (data.general_decline === true) classifierInput = { terminal_reason: "general_decline" };
    else if (data.declaration_confirmed === false) classifierInput = { terminal_reason: "declaration_denied" };
    else if (data.is_resident_uae !== undefined) classifierInput = data;

    if (!classifierInput) {
      res.json({ ok: true, skipped: "insufficient analysis data" });
      return;
    }

    const result = await runClassification(refresh.id, classifierInput);
    res.status(result.status).json({ ok: true, classification: result.body });
    return;
  }

  res.json({ ok: true, skipped: `unhandled event ${event}` });
});
