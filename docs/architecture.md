# Architecture

This project is the backend and officer dashboard for an automated KYC refresh
and FATCA/CRS compliance program. It does not run the voice agent itself — you
build and configure that in your voice platform — it provides everything the
agent calls into, and everything a compliance officer needs to review what the
agent couldn't resolve on its own.

```
 Your voice platform (agent + telephony)
        │  custom tool calls during the conversation
        ▼
 Supabase edge functions  ──────────────┐
   verify-account                        │
   uc2-get-next-crs-country               │ reads / writes
   uc2-store-tin-value                    │
   uc2-store-tin-reason                   ▼
   retell-kyc-processor  ───────►  Postgres (customers, kyc_refresh,
        ▲                          compliance_cases, customer_tins,
        │ post-call webhook        audit_logs)
   retell-events                          ▲
        │                                 │ RLS (authenticated role)
 retell-outbound-call ◄── dashboard ──────┘
   (dispatches calls)      "Trigger call" / case review / audit trail
```

- **Edge functions** (`supabase/functions/`) are the API surface — register
  their URLs as your agent's custom tools (see `tool-definitions.json`) and as
  its webhook target (`retell-events`). They run with the Postgres
  `service_role` key and are the only thing with write access to sensitive
  fields.
- **Dashboard** (`dashboard/`) is a Vite/React app compliance officers log
  into (Supabase Auth). It reads and writes tables directly through
  Supabase's client SDK under RLS, and calls `retell-outbound-call` (via
  `supabase.functions.invoke`) to dispatch calls — it never talks to your
  voice platform directly, so its API key stays server-side.
- **`_shared/oneinbox.ts`** is the one file that knows how to ask your voice
  platform to place a call. It's written to the OneInbox convention (`POST
  /v1/calls`, `Authorization: Bearer <key>`) seen in OneInbox's own
  dashboard client; if your platform's call-creation contract differs, that's
  the only file you need to change.

## The ten call-flow outcomes

Every refresh cycle (`kyc_refresh` row) ends in one of ten outcomes, stored as
`outcome_code`. This mirrors the platform's own flow definitions:

| Code | Name | What sets it | Where |
|---|---|---|---|
| UC-1.1 | Straight-Through | UAE-only resident, no US ties, no structure change, nothing changed | `retell-kyc-processor` |
| UC-1.2 | Profile Update | Same as UC-1.1, but `profile_updates` differed from what's on file | `retell-kyc-processor` |
| UC-1.3 | Dormant Account | `activity_status: "dormant"` in the screening payload | `retell-kyc-processor` |
| UC-D1 | Consent Denied | `end_call_early` with `terminal_reason: "consent_denied"` | `retell-kyc-processor` |
| UC-D2 | Authentication Failure | 3rd failed `verify_account` call in one cycle | `verify-account` |
| UC-D3 | Declaration Denied | `declaration_confirmed: false`, or explicit terminal reason | `retell-kyc-processor` → `compliance_cases` |
| UC-D4 | General Decline | `end_call_early` with `terminal_reason: "general_decline"` | `retell-kyc-processor` |
| UC-2.1 | Multiple Tax Residencies | Foreign tax residency declared, no US indicia, no TIN exception | `retell-kyc-processor` → `compliance_cases` |
| UC-2.2 | FATCA / US Indicia | `has_us_indicia: true` | `retell-kyc-processor` → `compliance_cases` |
| UC-2.3 | TIN Exception | A `customer_tins` row with `is_available: false` for this cycle | `retell-kyc-processor` → `compliance_cases` |

UC-D2 is the one outcome decided outside `retell-kyc-processor`, because it's
a hard 3-strikes rule enforced on every `verify-account` call, independent of
whether the agent ever reaches the screening questions.

`retell-events` (the webhook) is a safety net, not the primary path: if the
call ends and the agent never explicitly called `retell-kyc-processor` (e.g.
it hung up mid-script, or your platform's own post-call analysis extracted
the same fields), the `call_analyzed` event runs the identical classification
logic from the platform's extracted data. If the agent already closed the
cycle out, the webhook is a no-op.

## Two ways to close a call

The agent has exactly two ways to end a refresh cycle:

1. **`submit_kyc_screening`** → full screening payload → UC-1.x or UC-2.x.
2. **`end_call_early`** → `terminal_reason` → UC-D1, UC-D3, or UC-D4.

(UC-D2 needs no explicit call — it happens automatically inside
`verify-account` on the third failed attempt.)

## Retry / attempt limits

- `contact_attempts` / `max_attempts` (default 3) on `kyc_refresh` — how many
  times this customer has been *dialed* for the current cycle.
  `retell-outbound-call` refuses to dispatch a 4th.
- `auth_attempts` — how many times the agent tried `verify-account` *within
  one connected call*. Capped at 3, resets to 0 every time a new call is
  dispatched.

These are deliberately separate: a customer who never picks up shouldn't burn
authentication attempts, and a customer who fails 2FA on a connected call
shouldn't get a free extra phone call out of it.
