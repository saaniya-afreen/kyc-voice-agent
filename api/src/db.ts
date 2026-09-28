import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  // Render's managed Postgres requires TLS; it uses a Render-issued cert chain
  // that isn't in Node's default trust store, so we accept it without strict
  // verification rather than bundling Render's CA.
  ssl: env.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
});

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
