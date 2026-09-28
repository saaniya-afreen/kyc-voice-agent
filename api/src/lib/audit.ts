import { pool } from "../db.js";

export async function logAudit(entry: {
  customer_id?: string | null;
  kyc_refresh_id?: string | null;
  event_type: string;
  actor: string;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await pool.query(
      `insert into audit_logs (customer_id, kyc_refresh_id, event_type, actor, old_data, new_data)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.customer_id ?? null,
        entry.kyc_refresh_id ?? null,
        entry.event_type,
        entry.actor,
        entry.old_data ? JSON.stringify(entry.old_data) : null,
        entry.new_data ? JSON.stringify(entry.new_data) : null,
      ]
    );
  } catch (err) {
    // Audit logging must never break the calling flow — log and move on.
    console.error("audit log insert failed", entry.event_type, err);
  }
}
