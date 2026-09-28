// Some voice platforms' custom-request bodies only ever substitute template
// variables as quoted strings (quoting every field is also what keeps a blank/unset
// test value from producing invalid JSON — an empty substitution into an unquoted
// slot like "tax_residencies": {{tax_residencies}} breaks the whole body). These
// coerce those string-encoded values back to the types the rest of the app expects,
// while still passing through real booleans/arrays/objects unchanged if a platform
// does send native JSON types.

export function coerceBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // not JSON — fall through to comma-splitting
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function coerceObject(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON — ignore, no profile updates
  }
  return {};
}

// Empty-string test values for an optional field should behave like "not provided".
export function coerceOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

// Every kyc_refresh_id lookup goes into a `uuid` column — a malformed value (e.g. a
// voice platform sending the literal placeholder text "unknown" when its own
// {{kyc_refresh_id}} variable never got populated) would otherwise reach Postgres as
// an invalid uuid input error. Reject it here with a clear 400 instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
