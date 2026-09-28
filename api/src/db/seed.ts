import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import { pool, queryOne } from "../db.js";
import { env } from "../env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIRST_DEMO_CUSTOMER_ID = "00000000-0000-0000-0000-000000000001";

export async function seed(): Promise<void> {
  await seedOfficer();
  await seedDemoData();
}

async function seedOfficer(): Promise<void> {
  if (!env.seedOfficerEmail || !env.seedOfficerPassword) {
    console.log("seed: SEED_OFFICER_EMAIL/PASSWORD not set, skipping officer seed");
    return;
  }
  const existing = await queryOne("select id from officers where email = $1", [env.seedOfficerEmail]);
  if (existing) {
    console.log(`seed: officer ${env.seedOfficerEmail} already exists`);
    return;
  }
  const passwordHash = await bcrypt.hash(env.seedOfficerPassword, 10);
  await pool.query("insert into officers (email, password_hash, name) values ($1, $2, $3)", [
    env.seedOfficerEmail,
    passwordHash,
    "Demo Compliance Officer",
  ]);
  console.log(`seed: created officer ${env.seedOfficerEmail}`);
}

async function seedDemoData(): Promise<void> {
  if (!env.seedDemoData) {
    console.log("seed: SEED_DEMO_DATA=false, skipping demo data");
    return;
  }
  const existing = await queryOne("select id from customers where id = $1", [FIRST_DEMO_CUSTOMER_ID]);
  if (existing) {
    console.log("seed: demo data already present");
    return;
  }
  const sql = readFileSync(path.join(__dirname, "seed.sql"), "utf8");
  await pool.query(sql);
  console.log("seed: demo data inserted (10 call-flow outcomes + queue)");
}
