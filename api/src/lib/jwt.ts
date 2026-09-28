import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface OfficerTokenPayload {
  sub: string; // officer id
  email: string;
}

export function signOfficerToken(payload: OfficerTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyOfficerToken(token: string): OfficerTokenPayload {
  return jwt.verify(token, env.jwtSecret) as OfficerTokenPayload;
}
