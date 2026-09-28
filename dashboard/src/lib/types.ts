export type RiskTier = "low" | "medium" | "high";
export type KycStatus = "current" | "due" | "in_progress" | "completed" | "escalated";
export type CallStatus = "pending" | "calling" | "completed" | "escalated" | "failed" | "refused" | "declined";
export type CaseStatus = "pending_review" | "in_review" | "approved" | "rejected";
export type OutcomeCode =
  | "UC-1.1" | "UC-1.2" | "UC-1.3"
  | "UC-D1" | "UC-D2" | "UC-D3" | "UC-D4"
  | "UC-2.1" | "UC-2.2" | "UC-2.3"
  | null;

export interface Customer {
  id: string;
  full_name: string;
  phone_e164: string;
  account_number: string;
  date_of_birth: string;
  email: string | null;
  employer: string | null;
  occupation: string | null;
  address: string | null;
  risk_tier: RiskTier;
  kyc_status: KycStatus;
  activity_status: "active" | "dormant";
  next_review_date: string | null;
  created_at: string;
}

export interface KycRefresh {
  id: string;
  customer_id: string;
  trigger_source: "manual" | "scheduled";
  outcome_code: OutcomeCode;
  contact_attempts: number;
  max_attempts: number;
  auth_attempts: number;
  call_status: CallStatus;
  retell_call_id: string | null;
  call_recording_url: string | null;
  call_transcript: string | null;
  consent_given: boolean | null;
  last_call_at: string | null;
  created_at: string;
  customer?: Customer;
}

export interface ComplianceCase {
  id: string;
  customer_id: string;
  kyc_refresh_id: string | null;
  case_status: CaseStatus;
  escalation_reason: string;
  material_change_type: string | null;
  required_documents: string[];
  assigned_officer_id: string | null;
  reviewed_at: string | null;
  officer_notes: string | null;
  created_at: string;
  customer?: Customer;
  kyc_refresh?: KycRefresh;
}

export interface CustomerTin {
  id: string;
  customer_id: string;
  kyc_refresh_id: string | null;
  country_code: string;
  tin_value: string | null;
  is_available: boolean;
  reason_code: "A" | "B" | "C" | null;
  reason_explanation: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  customer_id: string | null;
  kyc_refresh_id: string | null;
  event_type: string;
  actor: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export const OUTCOME_LABELS: Record<string, string> = {
  "UC-1.1": "Straight-Through",
  "UC-1.2": "Profile Update",
  "UC-1.3": "Dormant Account",
  "UC-D1": "Consent Denied",
  "UC-D2": "Authentication Failure",
  "UC-D3": "Declaration Denied",
  "UC-D4": "General Decline",
  "UC-2.1": "Multiple Tax Residencies",
  "UC-2.2": "FATCA / US Indicia",
  "UC-2.3": "TIN Exception",
};
