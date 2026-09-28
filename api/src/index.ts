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

const app = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/v1/auth", authRouter);
app.use("/v1/trigger-outbound-call", callsRouter);
app.use("/v1/call-events", webhookRouter);
app.use("/v1/customers", customersRouter);
app.use("/v1/compliance-cases", complianceCasesRouter);
app.use("/v1/overview", overviewRouter);
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
