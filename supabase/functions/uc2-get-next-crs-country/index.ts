// POST /uc2-get-next-crs-country
// Steps the agent through each foreign tax residency one at a time, skipping
// countries already recorded (a TIN value or an OECD exception reason) for
// this call cycle so a re-asked question doesn't re-collect the same country.
//
// Body: { kyc_refresh_id: string, tax_residencies: string[] }  // ISO-2 codes, UAE excluded by the agent
// -> { next_country_code: string | null, is_finished: boolean, remaining_count: number }
import { serviceClient } from "../_shared/supabase.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireToolSecret } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const authError = requireToolSecret(req);
  if (authError) return authError;

  const supabase = serviceClient();
  const { kyc_refresh_id, tax_residencies } = await req.json();

  if (!kyc_refresh_id || !Array.isArray(tax_residencies)) {
    return jsonResponse({ error: "kyc_refresh_id and tax_residencies[] are required" }, 400);
  }

  const { data: recorded, error } = await supabase
    .from("customer_tins")
    .select("country_code")
    .eq("kyc_refresh_id", kyc_refresh_id);

  if (error) return jsonResponse({ error: error.message }, 500);

  const done = new Set((recorded ?? []).map((r) => r.country_code.toUpperCase()));
  const remaining = tax_residencies
    .map((c: string) => c.toUpperCase())
    .filter((c: string) => c !== "AE" && !done.has(c));

  return jsonResponse({
    next_country_code: remaining[0] ?? null,
    is_finished: remaining.length === 0,
    remaining_count: remaining.length,
  });
});
