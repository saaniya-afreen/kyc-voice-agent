// POST /submit-kyc-screening
// The single classification entrypoint. The agent calls it in one of two shapes:
//
// Early exit (consent refused / declaration refused / general decline — the
// agent hangs up right after, per its script):
//   { kyc_refresh_id, terminal_reason: "consent_denied" | "declaration_denied" | "general_decline" }
//
// Full screening submission (end of a completed conversation):
//   { kyc_refresh_id, is_resident_uae, tax_residencies, has_us_indicia, ssn?,
//     account_structure, activity_status?, profile_updates?, declaration_confirmed }
//
// -> { outcome: "UC1_AUTO_COMPLETED" | "UC2_ESCALATED_TO_COMPLIANCE" | "REFUSED" | "DECLINED",
//      outcome_code, next_review_date?, compliance_case_id? }
import { serviceClient } from "../_shared/supabase.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireToolSecret } from "../_shared/auth.ts";
import { runClassification } from "../_shared/kyc-processor-core.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const authError = requireToolSecret(req);
  if (authError) return authError;

  const supabase = serviceClient();
  const body = await req.json();
  const { kyc_refresh_id } = body;

  if (!kyc_refresh_id) return jsonResponse({ error: "kyc_refresh_id is required" }, 400);

  const result = await runClassification(supabase, kyc_refresh_id, body);
  return jsonResponse(result.body, result.status);
});
