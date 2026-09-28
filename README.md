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
supabase/
  migrations/0001_init.sql   customers, kyc_refresh, compliance_cases, customer_tins, audit_logs
  seed.sql                   demo data covering all ten outcomes
  functions/                 the API — one Deno edge function per endpoint
    verify-account/               in-call 2FA
    uc2-get-next-crs-country/     steps through declared tax residencies
    uc2-store-tin-value/          saves a collected TIN
    uc2-store-tin-reason/         saves an OECD TIN exception
    submit-kyc-screening/         final classification (UC-1.x / UC-2.x) + early-exit reasons
    call-events/                webhook: recordings, transcripts, post-call fallback classification
    trigger-outbound-call/         dispatches an outbound call (dashboard-only)
    _shared/                      cors, auth, audit logging, classification, crypto, voice-platform adapter
dashboard/                   React + Tailwind compliance officer app
docs/
  architecture.md            how it all fits together
  voice-agent-system-prompt.md  paste-able system prompt for the agent
  tool-definitions.json      the six custom tools, ready to register on your agent
```

## 1. Set up Supabase

```bash
npm install -g supabase   # if you don't have the CLI
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/0001_init.sql
```

Load the demo data (optional, but the dashboard is a lot more interesting
with it):

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/seed.sql
# or, against a hosted project: psql "<connection string from the Supabase dashboard>" -f supabase/seed.sql
```

### Function secrets

```bash
supabase secrets set \
  AGENT_TOOL_SECRET=$(openssl rand -hex 32) \
  WEBHOOK_SHARED_SECRET=$(openssl rand -hex 32) \
  SSN_ENCRYPTION_KEY=$(openssl rand -base64 32) \
  VOICE_PLATFORM_API_URL=https://api.oneinbox.ai \
  VOICE_PLATFORM_API_KEY=<your voice platform secret API key> \
  VOICE_PLATFORM_KYC_AGENT_ID=<the agent id you create for this use case>
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available to
every edge function automatically — you don't set those.)

`VOICE_PLATFORM_API_URL`/`VOICE_PLATFORM_API_KEY`/`VOICE_PLATFORM_KYC_AGENT_ID`
feed `supabase/functions/_shared/oneinbox.ts`, which dispatches outbound
calls. It's written to the OneInbox convention (`POST /v1/calls`, Bearer
API key) — if your platform's call-creation contract is different, that's
the only file to change.

### Deploy the functions

```bash
supabase functions deploy verify-account uc2-get-next-crs-country \
  uc2-store-tin-value uc2-store-tin-reason submit-kyc-screening \
  call-events trigger-outbound-call
```

## 2. Wire it into your voice agent

1. Create the KYC refresh agent on your platform.
2. Register the six tools from [`docs/tool-definitions.json`](docs/tool-definitions.json),
   replacing `{{FUNCTION_BASE_URL}}` with
   `https://<project-ref>.supabase.co/functions/v1`. Every tool needs the
   header `X-Tool-Secret: <AGENT_TOOL_SECRET>`.
3. Paste [`docs/voice-agent-system-prompt.md`](docs/voice-agent-system-prompt.md)
   into the agent's system prompt.
4. Point the agent's webhook at
   `https://<project-ref>.supabase.co/functions/v1/call-events` with header
   `X-Webhook-Secret: <WEBHOOK_SHARED_SECRET>`.

## 3. Run the dashboard

```bash
cd dashboard
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Create an officer login in Supabase Auth (dashboard → Authentication →
Users → Add user, or `supabase auth admin` if you're scripting it) — the
app only supports email/password sign-in for now.

Open http://localhost:5174:

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

- Every table has RLS on. The dashboard reads/writes as `authenticated`
  (an officer's Supabase Auth session); there's no `anon` grant on anything
  here — this data (DOBs, account numbers, transcripts) should never be
  reachable by an unauthenticated client.
- The five endpoints the agent calls mid-conversation run with
  `verify_jwt = false` (the voice platform has no Supabase session) and
  instead check a static `X-Tool-Secret` header — see
  `supabase/functions/_shared/auth.ts`. Only `trigger-outbound-call` requires
  a real officer JWT, since it's dashboard-only.
- A FATCA/US-indicia case's SSN (UC-2.2) is AES-GCM encrypted before it's
  stored (`supabase/functions/_shared/crypto.ts`), with the key living only
  as an edge function secret — never in the database, and the dashboard
  doesn't attempt to decrypt or display it.
- `audit_logs` is append-only by grant (`insert`/`select` only, no
  `update`/`delete` for `authenticated`) and uses `ON DELETE SET NULL` on its
  foreign keys so the evidence trail survives even if a customer record is
  later purged.
