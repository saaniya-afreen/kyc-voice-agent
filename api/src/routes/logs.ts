import { Router } from "express";
import { requireOfficer } from "../middleware/auth.js";
import { getRecentRequests } from "../lib/requestLog.js";

export const logsRouter = Router();
logsRouter.use(requireOfficer);

// GET /v1/logs — recent requests (most recent first), for the dashboard's Logs page.
logsRouter.get("/", (_req, res) => {
  res.json(getRecentRequests());
});
