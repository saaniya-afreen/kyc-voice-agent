import "express-async-errors"; // must load before any router — patches Express to forward async route errors to the error middleware instead of crashing the process on an unhandled rejection
import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import { authRouter } from "./routes/auth.js";
import { toolsRouter } from "./routes/tools.js";
import { webhookRouter } from "./routes/webhook.js";
import { callsRouter } from "./routes/calls.js";
import { customersRouter } from "./routes/customers.js";
import { complianceCasesRouter } from "./routes/complianceCases.js";
import { overviewRouter } from "./routes/overview.js";
import { adminRouter } from "./routes/admin.js";
import { logsRouter } from "./routes/logs.js";
import { recordRequest } from "./lib/requestLog.js";

const app = express();
app.use(cors({ origin: env.corsOrigin }));
// `type: () => true` parses the body as JSON regardless of Content-Type — some voice
// platforms' custom-request senders don't set Content-Type: application/json, and
// express.json() otherwise silently skips parsing (leaving req.body empty) instead
// of erroring, which shows up downstream as a confusing "X is required" 400.
app.use(express.json({ limit: "2mb", type: () => true }));
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "invalid JSON body" });
    return;
  }
  next(err);
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Render's free plan doesn't surface per-request logs, and diagnosing voice-platform
// tool-call issues needs to see exactly what arrived and what we sent back — log every
// request to console (captured in Render's app logs) rather than guessing blind.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const body = req.body && typeof req.body === "object" ? { ...req.body } : req.body;
    if (body && typeof body === "object" && "ssn" in body) body.ssn = "[redacted]";
    const tookMs = Date.now() - startedAt;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${tookMs}ms) body=${JSON.stringify(body)}`);
    // Skip the Logs page's own polling requests — they'd otherwise flood the buffer
    // with noise about themselves.
    if (!req.originalUrl.startsWith("/v1/logs")) {
      recordRequest({ method: req.method, path: req.originalUrl, status: res.statusCode, tookMs, body });
    }
  });
  next();
});

app.use("/v1/auth", authRouter);
app.use("/v1/trigger-outbound-call", callsRouter);
app.use("/v1/call-events", webhookRouter);
app.use("/v1/customers", customersRouter);
app.use("/v1/compliance-cases", complianceCasesRouter);
app.use("/v1/overview", overviewRouter);
app.use("/v1/admin", adminRouter);
app.use("/v1/logs", logsRouter);
// Agent tool endpoints live at the bare path each tool is registered with
// (POST /v1/verify-account, /v1/uc2-get-next-crs-country, ..., /v1/submit-kyc-screening).
app.use("/v1", toolsRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

async function main() {
  await migrate();
  await seed();
  app.listen(env.port, () => console.log(`kyc-voice-agent-api listening on :${env.port}`));
}

main().catch((err) => {
  console.error("fatal startup error", err);
  process.exit(1);
});
