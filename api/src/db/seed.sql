-- Demo data spanning all ten call-flow outcomes, plus a few customers still
-- sitting in the queue so the worklist's "Trigger call" action has something
-- to dispatch against. seed.ts guards this whole file behind a "does the
-- first demo customer already exist" check, so it's safe to run on every boot.

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000001', 'Amina Al Farsi', '+971501234501', '9990001234', '1985-03-14', 'amina.alfarsi@example.com', 'Emirates NBD', 'Financial Analyst', 'Marina Walk, Dubai', 'medium', 'completed', 'active', current_date + interval '3 years');

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'scheduled', 'UC-1.1', 1, 3, 1, 'completed', 'demo_call_001', 'https://example.com/recordings/demo_call_001.mp3',
   'Sarah: Hello, may I speak with Amina Al Farsi?\nAmina: Speaking.\nSarah: This is Sarah from the bank compliance team calling for your periodic KYC review. This call is recorded. Do I have your consent to proceed?\nAmina: Yes, go ahead.\n...\nSarah: Thank you, your KYC refresh is complete. Your next review will be in 3 years.',
   true, now() - interval '2 days');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'CALL_DISPATCHED', 'system', '{"attempt":1}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'AUTH_SUCCESS', 'voice_agent', '{"attempt":1}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'KYC_COMPLETED_STP', 'voice_agent', '{"outcome_code":"UC-1.1"}', now() - interval '2 days');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000002', 'Rashid Obaid', '+971501234502', '9990002234', '1978-11-02', 'rashid.obaid@example.com', 'Meraas Holding', 'Operations Manager', 'Jumeirah Beach Road, Dubai', 'medium', 'completed', 'active', current_date + interval '3 years');

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'scheduled', 'UC-1.2', 1, 3, 1, 'completed', 'demo_call_002', 'https://example.com/recordings/demo_call_002.mp3',
   'Sarah: I have your employer listed as Dubai Properties, is that still accurate?\nRashid: No, I moved to Meraas Holding earlier this year.\nSarah: Thank you, I have updated that.',
   true, now() - interval '5 days');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, old_data, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'KYC_COMPLETED_PROFILE_UPDATE', 'voice_agent', '{"employer":"Dubai Properties"}', '{"employer":"Meraas Holding"}', now() - interval '5 days');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000003', 'Mariam Saeed', '+971501234503', '9990003234', '1990-07-22', 'mariam.saeed@example.com', 'Unemployed', 'N/A', 'Al Barsha, Dubai', 'low', 'completed', 'dormant', current_date + interval '5 years');

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'scheduled', 'UC-1.3', 1, 3, 1, 'completed', 'demo_call_003', 'https://example.com/recordings/demo_call_003.mp3',
   'Sarah: Have you used this account in the past 12 months?\nMariam: No, I have not used it at all.\nSarah: Understood, I have recorded the account as dormant.',
   true, now() - interval '10 days');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'KYC_COMPLETED_DORMANT', 'voice_agent', '{"outcome_code":"UC-1.3"}', now() - interval '10 days');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000004', 'Yousef Khan', '+971501234504', '9990004234', '1982-01-09', 'yousef.khan@example.com', 'Khan Trading LLC', 'Business Owner', 'Deira, Dubai', 'medium', 'due', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'scheduled', 'UC-D1', 1, 3, 0, 'refused', 'demo_call_004', 'https://example.com/recordings/demo_call_004.mp3',
   'Sarah: This call is recorded. Do I have your verbal consent to proceed?\nYousef: No, I do not want to do this over the phone.\nSarah: I understand completely, a branch representative will follow up with you.',
   false, now() - interval '1 day');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, created_at) values
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'CONSENT_DENIED', 'voice_agent', now() - interval '1 day');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000005', 'Fatima Noor', '+971501234505', '9990005234', '1995-05-30', 'fatima.noor@example.com', 'Noor Design Studio', 'Interior Designer', 'Al Qusais, Dubai', 'low', 'due', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'scheduled', 'UC-D2', 1, 3, 3, 'failed', 'demo_call_005', 'https://example.com/recordings/demo_call_005.mp3',
   'Sarah: Could you confirm the last 4 digits of your account and your date of birth?\nFatima: [provides mismatched details, 3 attempts]\nSarah: I am sorry, we cannot verify your identity over the phone today. Please visit your nearest branch.',
   true, now() - interval '3 days');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'AUTH_FAILURE', 'voice_agent', '{"attempt":1}', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'AUTH_FAILURE', 'voice_agent', '{"attempt":2}', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'AUTH_LOCKED_OUT', 'voice_agent', '{"attempt":3}', now() - interval '3 days');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000006', 'Omar Haddad', '+971501234506', '9990006234', '1975-09-18', 'omar.haddad@example.com', 'Haddad Logistics', 'Managing Director', 'Business Bay, Dubai', 'high', 'escalated', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006', 'scheduled', 'UC-D3', 1, 3, 1, 'declined', 'demo_call_006', 'https://example.com/recordings/demo_call_006.mp3',
   'Sarah: Do you declare that the information you provided today is true, complete, and correct?\nOmar: I would rather not sign off on that over the phone.\nSarah: I understand, our compliance team will follow up with you directly.',
   true, now() - interval '4 hours');

insert into kyc_compliance_cases (id, customer_id, kyc_refresh_id, case_status, escalation_reason, required_documents, created_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'pending_review', 'Customer declined to make the required regulatory declaration', '{}', now() - interval '4 hours');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, created_at) values
  ('00000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'DECLARATION_DENIED', 'voice_agent', now() - interval '4 hours');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000007', 'Layla Ahmed', '+971501234507', '9990007234', '1988-12-05', 'layla.ahmed@example.com', 'Ahmed & Co', 'Consultant', 'Downtown Dubai', 'medium', 'due', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007', 'scheduled', 'UC-D4', 2, 3, 1, 'declined', 'demo_call_007', 'https://example.com/recordings/demo_call_007.mp3',
   'Sarah: Are you a tax resident of the UAE?\nLayla: Actually, I do not want to continue this call right now, can someone call me back later?\nSarah: Of course, I will note that and a representative will follow up.',
   true, now() - interval '6 hours');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, created_at) values
  ('00000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'GENERAL_DECLINE', 'voice_agent', now() - interval '6 hours');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000008', 'Karim Youssef', '+971501234508', '9990008234', '1980-04-11', 'karim.youssef@example.com', 'Global Consulting FZE', 'Senior Consultant', 'DIFC, Dubai', 'high', 'escalated', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008', 'scheduled', 'UC-2.1', 1, 3, 1, 'escalated', 'demo_call_008', 'https://example.com/recordings/demo_call_008.mp3',
   'Sarah: Do you hold tax residency in any other country besides the UAE?\nKarim: Yes, I am also a tax resident of the UK and India.\nSarah: Thank you, our compliance team will review your file.',
   true, now() - interval '1 day');

insert into kyc_customer_tins (customer_id, kyc_refresh_id, country_code, tin_value, is_available) values
  ('00000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'GB', 'AB123456C', true),
  ('00000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'IN', 'ABCDE1234F', true);

insert into kyc_compliance_cases (id, customer_id, kyc_refresh_id, case_status, escalation_reason, required_documents, created_at) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'pending_review', 'Foreign tax residency: GB, IN', '{"CRS Self-Certification Form"}', now() - interval '1 day');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'KYC_ESCALATED', 'voice_agent', '{"outcome_code":"UC-2.1"}', now() - interval '1 day');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000009', 'Jason Miller', '+971501234509', '9990009234', '1983-02-27', 'jason.miller@example.com', 'Miller Energy Partners', 'VP Operations', 'Palm Jumeirah, Dubai', 'high', 'escalated', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'scheduled', 'UC-2.2', 1, 3, 1, 'escalated', 'demo_call_009', 'https://example.com/recordings/demo_call_009.mp3',
   'Sarah: Are you a US citizen, green card holder, or were you born in the United States?\nJason: I was born in Houston, Texas, but I have lived in the UAE for 15 years.\nSarah: Thank you, our compliance team will follow up, potentially requesting a W-9 or W-8BEN form.',
   true, now() - interval '2 hours');

insert into kyc_compliance_cases (id, customer_id, kyc_refresh_id, case_status, escalation_reason, required_documents, created_at) values
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'pending_review', 'US indicia detected (FATCA)', '{"W-9 or W-8BEN Form"}', now() - interval '2 hours');
-- ssn_encrypted intentionally left null — a real case's SSN is only ever written by
-- POST /v1/submit-kyc-screening (see src/lib/crypto.ts).

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'KYC_ESCALATED', 'voice_agent', '{"outcome_code":"UC-2.2"}', now() - interval '2 hours');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000010', 'Elena Petrova', '+971501234510', '9990010234', '1992-06-19', 'elena.petrova@example.com', 'Petrova Freelance', 'Freelance Translator', 'Dubai Marina', 'medium', 'escalated', 'active', current_date);

insert into kyc_refresh (id, customer_id, trigger_source, outcome_code, contact_attempts, max_attempts, auth_attempts, call_status, provider_call_id, call_recording_url, call_transcript, consent_given, last_call_at) values
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000010', 'scheduled', 'UC-2.3', 1, 3, 1, 'escalated', 'demo_call_010', 'https://example.com/recordings/demo_call_010.mp3',
   'Sarah: Do you have your Tax Identification Number for Russia?\nElena: No, I was unable to obtain one before leaving.\nSarah: Understood, I have recorded that exception.',
   true, now() - interval '30 minutes');

insert into kyc_customer_tins (customer_id, kyc_refresh_id, country_code, is_available, reason_code, reason_explanation) values
  ('00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'RU', false, 'B', 'Customer was unable to obtain a TIN before relocating');

insert into kyc_compliance_cases (id, customer_id, kyc_refresh_id, case_status, escalation_reason, required_documents, created_at) values
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'pending_review', 'Foreign tax residency: RU | TIN exception on file (OECD reason code)', '{"CRS Self-Certification Form"}', now() - interval '30 minutes');

insert into kyc_audit_logs (customer_id, kyc_refresh_id, event_type, actor, new_data, created_at) values
  ('00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'TIN_EXCEPTION_RECORDED', 'voice_agent', '{"country_code":"RU","reason_code":"B"}', now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'KYC_ESCALATED', 'voice_agent', '{"outcome_code":"UC-2.3"}', now() - interval '30 minutes');

insert into kyc_customers (id, full_name, phone_e164, account_number, date_of_birth, email, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date) values
  ('00000000-0000-0000-0000-000000000011', 'Hassan Ali', '+971501234511', '9990011234', '1991-08-08', 'hassan.ali@example.com', 'Ali Trading', 'Sales Manager', 'Al Nahda, Dubai', 'low', 'due', 'active', current_date - interval '2 days'),
  ('00000000-0000-0000-0000-000000000012', 'Noura Salem', '+971501234512', '9990012234', '1987-10-23', 'noura.salem@example.com', 'Salem Retail Group', 'Retail Director', 'Mirdif, Dubai', 'medium', 'due', 'active', current_date + interval '5 days'),
  ('00000000-0000-0000-0000-000000000013', 'Zayd Rahman', '+971501234513', '9990013234', '1979-04-02', 'zayd.rahman@example.com', 'Rahman Capital', 'Managing Partner', 'DIFC, Dubai', 'high', 'due', 'active', current_date - interval '1 day');

insert into kyc_refresh (customer_id, trigger_source, contact_attempts, max_attempts, call_status) values
  ('00000000-0000-0000-0000-000000000012', 'scheduled', 1, 3, 'pending');
-- Hassan and Zayd have no kyc_refresh row yet — trigger-outbound-call creates one on first trigger.
