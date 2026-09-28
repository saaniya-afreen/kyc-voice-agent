import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function logAudit(
  supabase: SupabaseClient,
  entry: {
    customer_id?: string | null;
    kyc_refresh_id?: string | null;
    event_type: string;
    actor: string;
    old_data?: Record<string, unknown> | null;
    new_data?: Record<string, unknown> | null;
  }
) {
  const { error } = await supabase.from("audit_logs").insert({
    customer_id: entry.customer_id ?? null,
    kyc_refresh_id: entry.kyc_refresh_id ?? null,
    event_type: entry.event_type,
    actor: entry.actor,
    old_data: entry.old_data ?? null,
    new_data: entry.new_data ?? null,
  });
  // Audit logging must never break the calling flow — log and move on.
  if (error) console.error("audit log insert failed", entry.event_type, error.message);
}
