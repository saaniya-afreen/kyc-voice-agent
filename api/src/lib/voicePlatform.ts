// Thin adapter around your voice platform's call-dispatch API. Written to the OneInbox
// convention (Bearer <API key>, /v1 prefix, snake_case). If your platform's "create
// outbound call" request/response shape differs, this is the only file to change —
// every other route in this project is platform-agnostic and only calls this function,
// never the provider directly.
import { env } from "../env.js";

export async function dispatchOutboundCall(opts: {
  toNumber: string;
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
}): Promise<{ providerCallId: string }> {
  const res = await fetch(`${env.voicePlatformApiUrl}/v1/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.voicePlatformApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: env.voicePlatformKycAgentId,
      to_number: opts.toNumber,
      direction: "outbound",
      metadata: opts.metadata,
      dynamic_variables: opts.dynamicVariables,
    }),
  });

  if (!res.ok) {
    throw new Error(`voice platform call dispatch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id?: string; call_id?: string };
  const providerCallId = data.id ?? data.call_id;
  if (!providerCallId) throw new Error("voice platform response did not include a call id");
  return { providerCallId };
}
