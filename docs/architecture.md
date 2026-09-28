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
 api/ — Node/Express service on Render ─────┐
   POST /v1/verify-account                   │
   POST /v1/uc2-get-next-crs-country          │ reads / writes
   POST /v1/uc2-store-tin-value                │
   POST /v1/uc2-store-tin-reason               ▼
   POST /v1/submit-kyc-screening  ───►  Render Postgres (customers, kyc_refresh,
        ▲                              compliance_cases, customer_tins,
        │ webhook (post-call events)   audit_logs, officers)
   POST /v1/call-events                        ▲
        │                                      │ Bearer <officer JWT>
   POST /v1/trigger-outbound-call ◄── dashboard/ ── static site on Render
   GET  /v1/customers, /v1/compliance-cases,    "Trigger call" / case review / audit trail
        /v1/overview, POST /v1/auth/login
```

- **`api/`** is the whole API surface — a single Node/Express service. Register
  the agent-facing routes as your agent's custom tools (see
  `docs/tool-definitions.json`) and as its webhook target
  (`/v1/call-events`). Everything runs with a direct Postgres connection and
  is the only thing with write access to sensitive fields.
- **`dashboard/`** is a Vite/React app compliance officers log into (email +
  password against the `officers` table, JWT session). It calls the API's
  `/v1/customers`, `/v1/compliance-cases`, `/v1/overview` routes to read data
  and `/v1/trigger-outbound-call` to dispatch calls — it never talks to
  Postgres or your voice platform directly.
- **`api/src/lib/voicePlatform.ts`** is the one file that knows how to ask
  your voice platform to place a call. It's written to the OneInbox
  convention (`POST /v1/calls`, `Authorization: Bearer <key>`); if your
  platform's call-creation contract differs, that's the only file you need to
  change.

## The ten call-flow outcomes

Every refresh cycle (`kyc_refresh` row) ends in one of ten outcomes, stored as
`outcome_code`. This mirrors the platform's own flow definitions:

| Code | Name | What sets it | Where |
|---|---|---|---|
| UC-1.1 | Straight-Through | UAE-only resident, no US ties, no structure change, nothing changed | `submit-kyc-screening` |
| UC-1.2 | Profile Update | Same as UC-1.1, but `profile_updates` differed from what's on file | `submit-kyc-screening` |
| UC-1.3 | Dormant Account | `activity_status: "dormant"` in the screening payload | `submit-kyc-screening` |
| UC-D1 | Consent Denied | `end_call_early` with `terminal_reason: "consent_denied"` | `submit-kyc-screening` |
| UC-D2 | Authentication Failure | 3rd failed `verify_account` call in one cycle | `verify-account` |
| UC-D3 | Declaration Denied | `declaration_confirmed: false`, or explicit terminal reason | `submit-kyc-screening` → `compliance_cases` |
| UC-D4 | General Decline | `end_call_early` with `terminal_reason: "general_decline"` | `submit-kyc-screening` |
| UC-2.1 | Multiple Tax Residencies | Foreign tax residency declared, no US indicia, no TIN exception | `submit-kyc-screening` → `compliance_cases` |
| UC-2.2 | FATCA / US Indicia | `has_us_indicia: true` | `submit-kyc-screening` → `compliance_cases` |
| UC-2.3 | TIN Exception | A `customer_tins` row with `is_available: false` for this cycle | `submit-kyc-screening` → `compliance_cases` |

UC-D2 is the one outcome decided outside `submit-kyc-screening`, because it's
a hard 3-strikes rule enforced on every `verify-account` call, independent of
whether the agent ever reaches the screening questions.

`call-events` (the webhook) is a safety net, not the primary path: if the
call ends and the agent never explicitly called `submit-kyc-screening` (e.g.
it hung up mid-script, or your platform's own post-call analysis extracted
the same fields), the `call_analyzed` event runs the identical classification
logic from the platform's extracted data (`api/src/lib/kycProcessor.ts`, used
by both routes). If the agent already closed the cycle out, the webhook is a
no-op.

## Two ways to close a call

The agent has exactly two ways to end a refresh cycle, both hitting the same
`submit_kyc_screening` tool:

1. **Full screening payload** → UC-1.x or UC-2.x.
2. **`terminal_reason`** (via the `end_call_early` tool, same URL) → UC-D1,
   UC-D3, or UC-D4.

(UC-D2 needs no explicit call — it happens automatically inside
`verify-account` on the third failed attempt.)

## Retry / attempt limits

- `contact_attempts` / `max_attempts` (default 3) on `kyc_refresh` — how many
  times this customer has been *dialed* for the current cycle.
  `trigger-outbound-call` refuses to dispatch a 4th.
- `auth_attempts` — how many times the agent tried `verify-account` *within
  one connected call*. Capped at 3, resets to 0 every time a new call is
  dispatched.

These are deliberately separate: a customer who never picks up shouldn't burn
authentication attempts, and a customer who fails 2FA on a connected call
shouldn't get a free extra phone call out of it.

## Auth model

Two completely separate credentials, matching the two kinds of caller:

- **Officers** (dashboard) log in with email/password against the `officers`
  table and get a JWT (`POST /v1/auth/login`). Every dashboard-facing route
  (`/v1/customers`, `/v1/compliance-cases`, `/v1/overview`,
  `/v1/trigger-outbound-call`) requires `Authorization: Bearer <jwt>`.
- **The voice platform** has no officer session, so its routes
  (`verify-account`, `uc2-*`, `submit-kyc-screening`, `call-events`) are
  instead protected by a static shared secret sent as a custom header
  (`X-Tool-Secret` / `X-Webhook-Secret`) — see `api/src/middleware/auth.ts`.

A FATCA/US-indicia case's SSN (UC-2.2) is AES-256-GCM encrypted before it's
stored (`api/src/lib/crypto.ts`), with the key living only as an environment
variable (`SSN_ENCRYPTION_KEY`) — never in the database, and the dashboard
doesn't decrypt or display it.
