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

// kyc_refresh_id, as exposed to the voice agent, is an 8-hex-char short_code (not the
// real uuid primary key) — a voice model asked to reproduce a full uuid several turns
// later is unreliable at it (mistyping or outright hallucinating one; observed live as
// both the literal string "unknown" and a plausible-but-wrong uuid). A malformed value
// would otherwise reach Postgres as a failed lookup with no useful signal why — reject
// it here with a clear 400 instead.
const SHORT_CODE_RE = /^[0-9a-f]{8}$/i;
export function isValidShortCode(value: unknown): value is string {
  return typeof value === "string" && SHORT_CODE_RE.test(value);
}

// A real test call showed the agent calling verify_account before the customer had
// actually answered — sending "not provided" as a literal dob value. A plain non-empty
// check lets that through as if it were a genuine wrong answer, silently burning one of
// the customer's 3 real auth attempts for nothing. Reject obvious placeholder/filler
// text instead of treating it as a real (if incorrect) answer — digit_number and dob
// should always contain a digit in any real answer, in any format.
const PLACEHOLDER_ANSWERS = new Set([
  "not provided",
  "not given",
  "not yet provided",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "tbd",
]);
export function isRealAnswer(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || PLACEHOLDER_ANSWERS.has(trimmed)) return false;
  return /\d/.test(trimmed);
}

// verify-account compares the customer's date of birth against whatever string the
// agent sends — observed live sending "January 1, 1998" instead of the YYYY-MM-DD the
// prompt asks for, which would fail an otherwise-correct answer on a plain string
// comparison. Accepts the exact stored format, a named-month format ("January 1,
// 1998", "Jan 1 1998"), or a numeric date tried against every plausible
// day/month/year ordering — never guesses a single ordering, since a wrong guess
// there would misauthenticate someone.
export function matchesDob(inputDob: unknown, storedIsoDob: string): boolean {
  if (typeof inputDob !== "string") return false;
  const trimmed = inputDob.trim();
  if (trimmed === storedIsoDob) return true;

  if (/[a-zA-Z]/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
      if (iso === storedIsoDob) return true;
    }
    return false;
  }

  const numeric = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
  if (!numeric) return false;
  const [, a, b, c] = numeric;
  const pad = (s: string, len: number) => s.padStart(len, "0");
  const candidates = [
    `${pad(c, 4)}-${pad(b, 2)}-${pad(a, 2)}`, // DD-MM-YYYY
    `${pad(c, 4)}-${pad(a, 2)}-${pad(b, 2)}`, // MM-DD-YYYY
    `${pad(a, 4)}-${pad(b, 2)}-${pad(c, 2)}`, // YYYY-MM-DD with non-standard separators
  ];
  return candidates.includes(storedIsoDob);
}

// A real test call showed the agent sending account_structure as "power of attorney"
// instead of the "poa" enum value the schema asks for — isComplexStructure() does an
// exact match against "poa"/"trust", so that silently failed to flag a POA account as
// complex. Map common phrasings to the canonical value; anything unrecognized passes
// through unchanged (isComplexStructure will just treat it as not-complex, same risk
// as before this fix, not worse).
export function canonicalizeAccountStructure(value: unknown): string | undefined {
  const v = coerceOptionalString(value);
  if (!v) return v;
  const lower = v.trim().toLowerCase();
  if (["single", "joint", "poa", "trust"].includes(lower)) return lower;
  if (lower.includes("power of attorney") || lower.includes("poa")) return "poa";
  if (lower.includes("trust")) return "trust";
  if (lower.includes("joint")) return "joint";
  if (lower.includes("single") || lower.includes("personal") || lower.includes("individual") || lower.includes("only")) return "single";
  return v;
}

// A real test call showed the agent sending "South Korea" instead of the ISO 3166-1
// alpha-2 code "KR" to get_next_crs_country — and "UAE" instead of "AE" would silently
// misclassify a UAE-only customer as a foreign tax resident (isForeignTaxResident just
// checks !== "AE"). Map the phrasings actually observed; this is not an exhaustive
// country list, just a safety net for the common ones.
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "UAE": "AE",
  "UNITED ARAB EMIRATES": "AE",
  "USA": "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  "US OF A": "US",
  "SOUTH KOREA": "KR",
  "REPUBLIC OF KOREA": "KR",
  "NORTH KOREA": "KP",
  "UK": "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  "INDIA": "IN",
};
export function canonicalizeCountryCode(value: string): string {
  const upper = value.trim().toUpperCase();
  return COUNTRY_NAME_TO_ISO[upper] ?? upper;
}
