// POST /uc2-store-tin-value
// Body: { kyc_refresh_id: string, country_code: string, tin_value: string }
// -> { success: boolean }
import { serviceClient } from "../_shared/supabase.ts";
import { logAudit } from "../_shared/audit.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { requireToolSecret } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const authError = requireToolSecret(req);
  if (authError) return authError;

  const supabase = serviceClient();
  const { kyc_refresh_id, country_code, tin_value } = await req.json();

  if (!kyc_refresh_id || !country_code || !tin_value) {
    return jsonResponse({ error: "kyc_refresh_id, country_code and tin_value are required" }, 400);
  }

  const { data: refresh, error: refreshError } = await supabase
    .from("kyc_refresh")
    .select("customer_id")
    .eq("id", kyc_refresh_id)
    .single();

  if (refreshError || !refresh) return jsonResponse({ error: "kyc_refresh not found" }, 404);

  const { error } = await supabase.from("customer_tins").upsert(
    {
      customer_id: refresh.customer_id,
      kyc_refresh_id,
      country_code: country_code.toUpperCase(),
      tin_value,
      is_available: true,
      reason_code: null,
      reason_explanation: null,
    },
    { onConflict: "kyc_refresh_id,country_code" }
  );

  if (error) return jsonResponse({ success: false, error: error.message }, 500);

  await logAudit(supabase, {
    customer_id: refresh.customer_id,
    kyc_refresh_id,
    event_type: "TIN_RECORDED",
    actor: "voice_agent",
    new_data: { country_code: country_code.toUpperCase() }, // never log the TIN value itself
  });

  return jsonResponse({ success: true });
});
