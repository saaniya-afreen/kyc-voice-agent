import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// service_role client — used only inside edge functions, never shipped to a browser.
// It bypasses RLS, which is why every function here validates its own inputs.
export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
