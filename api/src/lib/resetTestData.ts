import { pool } from "../db.js";
import { logAudit } from "./audit.js";

// Wipes every kyc_refresh cycle (and dependent TIN/case rows) for one customer and
// puts them back to a clean, never-called kyc_status='due' baseline — used by both
// the admin/agent-tool reset endpoint and the dashboard's "Reset for testing" button.
export async function resetCustomerTestData(customerId: string, actor: string): Promise<number> {
  const deleted = await pool.query("delete from kyc_refresh where customer_id = $1", [customerId]);
  await pool.query(
    "update kyc_customers set kyc_status = 'due', activity_status = 'active', next_review_date = null where id = $1",
    [customerId]
  );

  await logAudit({
    customer_id: customerId,
    kyc_refresh_id: null,
    event_type: "TEST_DATA_RESET",
    actor,
    new_data: { kyc_refresh_cycles_deleted: deleted.rowCount },
  });

  return deleted.rowCount ?? 0;
}
