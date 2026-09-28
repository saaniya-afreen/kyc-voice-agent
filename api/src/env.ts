function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  agentToolSecret: required("AGENT_TOOL_SECRET"),
  webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? "",
  ssnEncryptionKey: required("SSN_ENCRYPTION_KEY"), // 32 bytes, base64
  voicePlatformApiUrl: process.env.VOICE_PLATFORM_API_URL ?? "https://api.oneinbox.ai",
  voicePlatformApiKey: process.env.VOICE_PLATFORM_API_KEY ?? "",
  voicePlatformKycAgentId: process.env.VOICE_PLATFORM_KYC_AGENT_ID ?? "",
  seedOfficerEmail: process.env.SEED_OFFICER_EMAIL ?? "",
  seedOfficerPassword: process.env.SEED_OFFICER_PASSWORD ?? "",
  seedDemoData: process.env.SEED_DEMO_DATA !== "false",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  // Drops the officer-login requirement on every dashboard-facing route (customers,
  // compliance cases, overview, trigger-outbound-call) — anyone with the dashboard
  // URL can read and act on this data. Off by default; only meant for throwaway
  // testing, never for a deployment holding real customer data.
  dashboardAuthDisabled: process.env.DASHBOARD_AUTH_DISABLED === "true",
};
