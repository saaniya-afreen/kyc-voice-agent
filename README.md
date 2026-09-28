# KYC Voice Agent

Backend and compliance dashboard for an automated periodic KYC refresh and
FATCA/CRS tax-residency program, built to plug into the KYC voice agent you
create on your own voice AI platform. This project does **not** build or
host the voice agent — it gives that agent a set of custom tools to call
during the conversation, a webhook to report back to, and gives compliance
officers a dashboard to review anything the agent couldn't resolve on its
own.

See [`docs/architecture.md`](docs/architecture.md) for how the pieces fit
together and how the ten call-flow outcomes (straight-through, dormant,
consent denied, FATCA/US indicia, TIN exceptions, ...) map onto this
project's tables and endpoints.

## Repo layout

```
api/                        Node/Express API — deploy this to Render (or any Node host)
  src/db/schema.sql              idempotent schema: customers, kyc_refresh, compliance_cases,
                                  customer_tins, audit_logs, officers
  src/db/seed.sql, seed.ts       demo data covering all ten outcomes + one seeded officer login
  src/routes/
    tools.ts                     verify-account, uc2-get-next-crs-country, uc2-store-tin-value,
                                  uc2-store-tin-reason, submit-kyc-screening (agent-facing)
    webhook.ts                   call-events — recordings, transcripts, post-call fallback classification
    calls.ts                     trigger-outbound-call (dashboard-only)
    customers.ts, complianceCases.ts, overview.ts, auth.ts   dashboard-facing REST + officer login
  src/lib/                       classification, audit logging, SSN encryption, voice-platform adapter
dashboard/                  React + Tailwind compliance officer app (Render static site)
docs/
  architecture.md            how it all fits together
  voice-agent-system-prompt.md  paste-able system prompt for the agent
  tool-definitions.json      the seven custom tools, ready to register on your agent
```

## 1. Deploy the API + database

The API is a plain Node/Express service — deploy it to Render, Vercel,
Railway, or anywhere else that runs Node. Render example:

1. **Postgres**: create a Postgres instance (Render → New → PostgreSQL, or
   any managed Postgres). Grab its connection string.
2. **Web service**: point it at this repo.
   - Build command: `npm --prefix api install && npm --prefix api run build`
   - Start command: `npm --prefix api run start`
   - Environment variables (see `api/.env.example`):
     - `DATABASE_URL` — the Postgres connection string
     - `JWT_SECRET`, `AGENT_TOOL_SECRET`, `WEBHOOK_SHARED_SECRET` — random strings (`openssl rand -hex 32`)
     - `SSN_ENCRYPTION_KEY` — 32 random bytes, base64 (`openssl rand -base64 32`)
     - `VOICE_PLATFORM_API_URL` / `VOICE_PLATFORM_API_KEY` / `VOICE_PLATFORM_KYC_AGENT_ID` — your voice platform's call-dispatch API
     - `SEED_OFFICER_EMAIL` / `SEED_OFFICER_PASSWORD` — creates one compliance-officer login on first boot

The schema and demo data are applied automatically on startup (idempotent —
safe on every deploy). No separate migration step needed.

## 2. Wire it into your voice agent

1. Create the KYC refresh agent on your platform.
2. Register the seven tools from [`docs/tool-definitions.json`](docs/tool-definitions.json),
   replacing `{{API_BASE_URL}}` with your deployed API's URL. Every tool
   needs the header `X-Tool-Secret: <AGENT_TOOL_SECRET>`.
3. Paste [`docs/voice-agent-system-prompt.md`](docs/voice-agent-system-prompt.md)
   into the agent's system prompt.
4. Point the agent's webhook at `<API_BASE_URL>/v1/call-events` with header
   `X-Webhook-Secret: <WEBHOOK_SHARED_SECRET>`.

## 3. Deploy / run the dashboard

Static site (React build) — deploy anywhere that serves static files
(Render Static Site, Vercel, Netlify, ...):

- Build command: `npm --prefix dashboard install && npm --prefix dashboard run build`
- Publish directory: `dashboard/dist`
- Environment variable: `VITE_API_URL` = your deployed API's URL

Locally:

```bash
cd dashboard
npm install
cp .env.example .env   # fill in VITE_API_URL
npm run dev
```

Log in with the `SEED_OFFICER_EMAIL` / `SEED_OFFICER_PASSWORD` you set on the
API — that account is created automatically on first boot.

- **Overview** — KPI cards, KYC funnel, pending-compliance preview
- **KYC Worklist** — risk-tiered queue with attempt counters and a "Trigger
  call" action (calls `trigger-outbound-call`)
- **Compliance Queue** — escalated cases; each opens into a case review
  screen with the recording, transcript, collected TINs, required-document
  checklist, and officer actions (assign / approve & complete / request
  manual outreach)
- **Customer detail** — profile, declared tax residencies, refresh-cycle
  history, and the full audit trail

## Security notes

- The five endpoints the agent calls mid-conversation
  (`verify-account`, `uc2-*`, `submit-kyc-screening`) and the webhook
  (`call-events`) check a static shared-secret header — see
  `api/src/middleware/auth.ts`. `trigger-outbound-call` and every
  dashboard-facing route instead require a real officer JWT
  (`POST /v1/auth/login`).
- A FATCA/US-indicia case's SSN (UC-2.2) is AES-256-GCM encrypted before it's
  stored (`api/src/lib/crypto.ts`), with the key living only as the
  `SSN_ENCRYPTION_KEY` environment variable — never in the database, and the
  dashboard doesn't attempt to decrypt or display it.
- `audit_logs` uses `ON DELETE SET NULL` on its foreign keys so the evidence
  trail survives even if a customer record is later purged.
