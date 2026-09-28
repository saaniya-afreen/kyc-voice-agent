import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { verifyOfficerToken, type OfficerTokenPayload } from "../lib/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      officer?: OfficerTokenPayload;
    }
  }
}

// The voice platform calls these routes directly with no Supabase/officer session,
// so they're protected by a static shared secret instead — configure it as a custom
// header on each tool in your voice platform.
export function requireToolSecret(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-tool-secret") !== env.agentToolSecret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  if (env.webhookSharedSecret && req.header("x-webhook-secret") !== env.webhookSharedSecret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// Dashboard-only routes: requires a valid officer JWT from POST /v1/auth/login.
export function requireOfficer(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    req.officer = verifyOfficerToken(token);
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
