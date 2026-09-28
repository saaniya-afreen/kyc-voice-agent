// These functions are called directly by the voice platform (in-call tool calls),
// which carries no Supabase session — that's why they run with verify_jwt = false
// in config.toml. Without some other check they'd be open to anyone who finds the
// URL, so every in-call tool requires a static shared secret instead, set as the
// AGENT_TOOL_SECRET function secret and configured as a custom header on each tool
// in your voice platform.
import { jsonResponse } from "./cors.ts";

export function requireToolSecret(req: Request): Response | null {
  const expected = Deno.env.get("AGENT_TOOL_SECRET");
  if (!expected) {
    console.error("AGENT_TOOL_SECRET is not set — refusing to serve an unauthenticated tool call");
    return jsonResponse({ error: "server misconfigured" }, 500);
  }
  if (req.headers.get("x-tool-secret") !== expected) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  return null;
}
