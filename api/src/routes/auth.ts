import { Router } from "express";
import bcrypt from "bcryptjs";
import { queryOne } from "../db.js";
import { signOfficerToken } from "../lib/jwt.js";
import { requireOfficer } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const officer = await queryOne<{ id: string; email: string; password_hash: string; name: string | null }>(
    "select id, email, password_hash, name from kyc_officers where email = $1",
    [String(email).toLowerCase()]
  );

  if (!officer || !(await bcrypt.compare(password, officer.password_hash))) {
    res.status(401).json({ error: "invalid email or password" });
    return;
  }

  const token = signOfficerToken({ sub: officer.id, email: officer.email });
  res.json({ access_token: token, officer: { id: officer.id, email: officer.email, name: officer.name } });
});

authRouter.get("/me", requireOfficer, async (req, res) => {
  const officer = await queryOne<{ id: string; email: string; name: string | null }>(
    "select id, email, name from kyc_officers where id = $1",
    [req.officer!.sub]
  );
  if (!officer) {
    res.status(404).json({ error: "officer not found" });
    return;
  }
  res.json(officer);
});
