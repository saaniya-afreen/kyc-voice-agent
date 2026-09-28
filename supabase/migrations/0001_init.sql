-- KYC Voice Agent — core schema
-- Customers due for periodic KYC refresh, the calls that refresh them,
-- the compliance cases those calls can escalate to, collected tax IDs,
-- and an append-only audit trail of every state change.

create extension if not exists pgcrypto;

create type public.risk_tier_level as enum ('low', 'medium', 'high');
create type public.kyc_status_type as enum ('current', 'due', 'in_progress', 'completed', 'escalated');
create type public.case_status_type as enum ('pending_review', 'in_review', 'approved', 'rejected');

-- One of the platform's ten call-flow outcomes (see docs/architecture.md).
create type public.kyc_outcome_code as enum (
  'UC-1.1', -- Straight-Through
  'UC-1.2', -- Profile Update
  'UC-1.3', -- Dormant Account
  'UC-D1',  -- Consent Denied
  'UC-D2',  -- Authentication Failure
  'UC-D3',  -- Declaration Denied
  'UC-D4',  -- General Decline
  'UC-2.1', -- Multiple Tax Residencies
  'UC-2.2', -- FATCA / US Indicia
  'UC-2.3'  -- TIN Exception
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_e164 text not null,
  account_number text not null,
  date_of_birth date not null,
  email text,
  employer text,
  occupation text,
  address text,
  risk_tier public.risk_tier_level not null default 'medium',
  kyc_status public.kyc_status_type not null default 'due',
  activity_status text not null default 'active' check (activity_status in ('active', 'dormant')),
  next_review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_kyc_status_idx on public.customers (kyc_status);
create index customers_next_review_date_idx on public.customers (next_review_date);
create index customers_risk_tier_idx on public.customers (risk_tier);

create table public.kyc_refresh (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  trigger_source text not null default 'scheduled' check (trigger_source in ('manual', 'scheduled')),
  outcome_code public.kyc_outcome_code,
  contact_attempts int not null default 0,
  max_attempts int not null default 3,
  auth_attempts int not null default 0, -- in-call 2FA attempts this cycle, capped at 3 (UC-D2)
  -- pending: queued: calling: dispatched to the voice provider: completed/escalated/failed/refused/declined
  -- are the terminal states a call cycle can land in (see outcome_code for which of the ten flows produced it).
  call_status text not null default 'pending'
    check (call_status in ('pending', 'calling', 'completed', 'escalated', 'failed', 'refused', 'declined')),
  retell_call_id text,
  call_recording_url text,
  call_transcript text,
  consent_given boolean,
  last_call_at timestamptz,
  created_at timestamptz not null default now()
);

create index kyc_refresh_customer_id_idx on public.kyc_refresh (customer_id);
create index kyc_refresh_call_status_idx on public.kyc_refresh (call_status);
create index kyc_refresh_retell_call_id_idx on public.kyc_refresh (retell_call_id);

create table public.compliance_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  kyc_refresh_id uuid references public.kyc_refresh (id) on delete set null,
  case_status public.case_status_type not null default 'pending_review',
  escalation_reason text not null,
  material_change_type text,
  required_documents text[] not null default '{}',
  -- FATCA/US-indicia cases (UC-2.2) capture an SSN. It is symmetrically encrypted with
  -- pgcrypto (key supplied at call time by the edge function from a secret, never stored
  -- in the database) rather than kept in plaintext — never select/decrypt this outside
  -- the officer-facing case review action.
  ssn_encrypted bytea,
  assigned_officer_id uuid references auth.users (id),
  reviewed_at timestamptz,
  officer_notes text,
  created_at timestamptz not null default now()
);

create index compliance_cases_customer_id_idx on public.compliance_cases (customer_id);
create index compliance_cases_case_status_idx on public.compliance_cases (case_status);

create table public.customer_tins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  kyc_refresh_id uuid references public.kyc_refresh (id) on delete set null,
  country_code varchar(2) not null,
  tin_value text,
  is_available boolean not null default true,
  -- OECD reason codes for a missing TIN: A = country doesn't issue TINs,
  -- B = customer unable to obtain one, C = not required by that country's law.
  reason_code varchar(1) check (reason_code in ('A', 'B', 'C')),
  reason_explanation text,
  created_at timestamptz not null default now(),
  constraint tin_or_reason check (
    (is_available and tin_value is not null) or (not is_available and reason_code is not null)
  )
);

create index customer_tins_customer_id_idx on public.customer_tins (customer_id);
create unique index customer_tins_refresh_country_idx on public.customer_tins (kyc_refresh_id, country_code);

-- Append-only. Rows are never updated or deleted by application code — only inserted.
-- customer_id/kyc_refresh_id use ON DELETE SET NULL (not CASCADE) so the evidence trail
-- survives even if the customer record it describes is later purged.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  kyc_refresh_id uuid references public.kyc_refresh (id) on delete set null,
  event_type text not null,
  actor text not null, -- 'voice_agent' | 'system' | an officer's auth.users id (as text)
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_customer_id_idx on public.audit_logs (customer_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- RLS: officers authenticate into the dashboard via Supabase Auth and get the
-- `authenticated` role; all business logic runs server-side in edge functions
-- using the service_role key, which bypasses RLS entirely. There is no `anon`
-- grant — this data (SSNs, DOBs, account numbers, call transcripts) must never
-- be reachable by an unauthenticated client.
alter table public.customers enable row level security;
alter table public.kyc_refresh enable row level security;
alter table public.compliance_cases enable row level security;
alter table public.customer_tins enable row level security;
alter table public.audit_logs enable row level security;

grant select, insert, update, delete on public.customers, public.kyc_refresh,
  public.compliance_cases, public.customer_tins to authenticated;
grant select, insert, update on public.audit_logs to authenticated; -- no delete: append-only
grant all on all tables in schema public to service_role;

create policy "authenticated read/write customers" on public.customers for all to authenticated using (true);
create policy "authenticated read/write kyc_refresh" on public.kyc_refresh for all to authenticated using (true);
create policy "authenticated read/write compliance_cases" on public.compliance_cases for all to authenticated using (true);
create policy "authenticated read/write customer_tins" on public.customer_tins for all to authenticated using (true);
create policy "authenticated read/insert audit_logs" on public.audit_logs for select to authenticated using (true);
create policy "authenticated insert audit_logs" on public.audit_logs for insert to authenticated with check (true);
