// Thin adapter around your voice platform's call-dispatch API. Written to the OneInbox
// convention (Bearer <API key>, /v1 prefix, snake_case). If your platform's "create
// outbound call" request/response shape differs, this is the only file to change —
// every other function in this project is platform-agnostic and only talks to this
// file, never to the provider directly.
const BASE_URL = Deno.env.get("VOICE_PLATFORM_API_URL") ?? "https://api.oneinbox.ai";
const API_KEY = Deno.env.get("VOICE_PLATFORM_API_KEY")!;
const AGENT_ID = Deno.env.get("VOICE_PLATFORM_KYC_AGENT_ID")!;

export async function dispatchOutboundCall(opts: {
  toNumber: string;
  metadata: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
}): Promise<{ providerCallId: string }> {
  const res = await fetch(`${BASE_URL}/v1/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: AGENT_ID,
      to_number: opts.toNumber,
      direction: "outbound",
      metadata: opts.metadata,
      dynamic_variables: opts.dynamicVariables,
    }),
  });

  if (!res.ok) {
    throw new Error(`voice platform call dispatch failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const providerCallId = data.id ?? data.call_id;
  if (!providerCallId) throw new Error("voice platform response did not include a call id");
  return { providerCallId };
}
