import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import { pool, queryOne } from "../db.js";
import { env } from "../env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIRST_DEMO_CUSTOMER_ID = "00000000-0000-0000-0000-000000000001";

const TEST_CONTACTS = [
  {
    full_name: "Saaniya",
    phone_e164: "+919901108427",
    account_number: "1234500001",
    date_of_birth: "1998-01-01",
    employer: "Vibtree Technologies",
    occupation: "Product Manager",
    address: "Bangalore, Karnataka, India",
  },
  {
    full_name: "Shivam",
    phone_e164: "+917014685581",
    account_number: "1234500002",
    date_of_birth: "1995-05-15",
    employer: "Vibtree Technologies",
    occupation: "Software Engineer",
    address: "Mumbai, Maharashtra, India",
  },
  {
    full_name: "Jayant",
    phone_e164: "+919508509567",
    account_number: "1234500003",
    date_of_birth: "1993-08-20",
    employer: "Vibtree Technologies",
    occupation: "Sales Manager",
    address: "Delhi, India",
  },
];

export async function seed(): Promise<void> {
  await seedOfficer();
  await seedDemoData();
  await seedTestContacts();
}

async function seedOfficer(): Promise<void> {
  if (!env.seedOfficerEmail || !env.seedOfficerPassword) {
    console.log("seed: SEED_OFFICER_EMAIL/PASSWORD not set, skipping officer seed");
    return;
  }
  const existing = await queryOne("select id from kyc_officers where email = $1", [env.seedOfficerEmail]);
  if (existing) {
    console.log(`seed: officer ${env.seedOfficerEmail} already exists`);
    return;
  }
  const passwordHash = await bcrypt.hash(env.seedOfficerPassword, 10);
  await pool.query("insert into kyc_officers (email, password_hash, name) values ($1, $2, $3)", [
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
  const existing = await queryOne("select id from kyc_customers where id = $1", [FIRST_DEMO_CUSTOMER_ID]);
  if (existing) {
    console.log("seed: demo data already present");
    return;
  }
  const sql = readFileSync(path.join(__dirname, "seed.sql"), "utf8");
  await pool.query(sql);
  console.log("seed: demo data inserted (10 call-flow outcomes + queue)");
}

// Real phone numbers used for manually-triggered live testing — kept separate from
// seedDemoData so it still runs (and picks up newly added/edited contacts) even
// after the one-time demo data insert has already happened on a prior deploy.
// Re-applies employer/occupation/address on every boot so editing TEST_CONTACTS
// above and redeploying is enough to update them.
async function seedTestContacts(): Promise<void> {
  for (const contact of TEST_CONTACTS) {
    const existing = await queryOne<{ id: string }>("select id from kyc_customers where phone_e164 = $1", [
      contact.phone_e164,
    ]);
    if (existing) {
      await pool.query("update kyc_customers set employer = $2, occupation = $3, address = $4 where id = $1", [
        existing.id,
        contact.employer,
        contact.occupation,
        contact.address,
      ]);
      continue;
    }
    await pool.query(
      `insert into kyc_customers (full_name, phone_e164, account_number, date_of_birth, employer, occupation, address, risk_tier, kyc_status, activity_status, next_review_date)
       values ($1, $2, $3, $4, $5, $6, $7, 'medium', 'due', 'active', current_date)`,
      [
        contact.full_name,
        contact.phone_e164,
        contact.account_number,
        contact.date_of_birth,
        contact.employer,
        contact.occupation,
        contact.address,
      ]
    );
    console.log(`seed: created test contact ${contact.full_name} (${contact.phone_e164})`);
  }
}
