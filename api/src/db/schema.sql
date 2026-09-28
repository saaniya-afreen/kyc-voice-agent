-- Idempotent schema — run at boot, safe to re-run on every deploy.
-- (Enums are plain TEXT + CHECK rather than Postgres ENUM types so this file
-- can use IF NOT EXISTS everywhere without the extra ceremony ALTER TYPE
-- needs; app-level validation covers the same ground.)

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists kyc_officers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists kyc_customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_e164 text not null,
  account_number text not null,
  date_of_birth date not null,
  email text,
  employer text,
  occupation text,
  address text,
  risk_tier text not null default 'medium' check (risk_tier in ('low', 'medium', 'high')),
  kyc_status text not null default 'due' check (kyc_status in ('current', 'due', 'in_progress', 'completed', 'escalated')),
  activity_status text not null default 'active' check (activity_status in ('active', 'dormant')),
  next_review_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_customers_kyc_status_idx on kyc_customers (kyc_status);
create index if not exists kyc_customers_next_review_date_idx on kyc_customers (next_review_date);
create index if not exists kyc_customers_risk_tier_idx on kyc_customers (risk_tier);

create table if not exists kyc_refresh (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references kyc_customers (id) on delete cascade,
  trigger_source text not null default 'scheduled' check (trigger_source in ('manual', 'scheduled')),
  -- one of the platform's ten call-flow outcomes (UC-1.1 ... UC-2.3) — see docs/architecture.md
  outcome_code text,
  contact_attempts int not null default 0,
  max_attempts int not null default 3,
  auth_attempts int not null default 0,
  call_status text not null default 'pending'
    check (call_status in ('pending', 'calling', 'completed', 'escalated', 'failed', 'refused', 'declined')),
  provider_call_id text,
  call_recording_url text,
  call_transcript text,
  consent_given boolean,
  last_call_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists kyc_refresh_customer_id_idx on kyc_refresh (customer_id);
create index if not exists kyc_refresh_call_status_idx on kyc_refresh (call_status);
create index if not exists kyc_refresh_provider_call_id_idx on kyc_refresh (provider_call_id);

create table if not exists kyc_compliance_cases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references kyc_customers (id) on delete cascade,
  kyc_refresh_id uuid references kyc_refresh (id) on delete set null,
  case_status text not null default 'pending_review' check (case_status in ('pending_review', 'in_review', 'approved', 'rejected')),
  escalation_reason text not null,
  material_change_type text,
  required_documents text[] not null default '{}',
  -- AES-GCM ciphertext (see src/lib/crypto.ts) — the key lives only in SSN_ENCRYPTION_KEY, never in the DB.
  ssn_encrypted bytea,
  assigned_officer_id uuid references kyc_officers (id),
  reviewed_at timestamptz,
  officer_notes text,
  created_at timestamptz not null default now()
);

create index if not exists kyc_compliance_cases_customer_id_idx on kyc_compliance_cases (customer_id);
create index if not exists kyc_compliance_cases_case_status_idx on kyc_compliance_cases (case_status);

create table if not exists kyc_customer_tins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references kyc_customers (id) on delete cascade,
  kyc_refresh_id uuid references kyc_refresh (id) on delete set null,
  country_code varchar(2) not null,
  tin_value text,
  is_available boolean not null default true,
  reason_code varchar(1) check (reason_code in ('A', 'B', 'C')),
  reason_explanation text,
  created_at timestamptz not null default now(),
  constraint kyc_tin_or_reason check (
    (is_available and tin_value is not null) or (not is_available and reason_code is not null)
  )
);

create index if not exists kyc_customer_tins_customer_id_idx on kyc_customer_tins (customer_id);
create unique index if not exists kyc_customer_tins_refresh_country_idx on kyc_customer_tins (kyc_refresh_id, country_code);

-- Append-only. customer_id/kyc_refresh_id use SET NULL (not CASCADE) so the evidence
-- trail survives even if the record it describes is later purged.
create table if not exists kyc_audit_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references kyc_customers (id) on delete set null,
  kyc_refresh_id uuid references kyc_refresh (id) on delete set null,
  event_type text not null,
  actor text not null, -- 'voice_agent' | 'system' | an officer's id or email
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kyc_audit_logs_customer_id_idx on kyc_audit_logs (customer_id);
create index if not exists kyc_audit_logs_created_at_idx on kyc_audit_logs (created_at desc);
