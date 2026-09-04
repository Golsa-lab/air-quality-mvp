import { Pool } from "pg";

/**
 * A single pool for the whole process. In development Next.js reloads modules
 * on every change, so the pool is cached on globalThis to avoid opening a new
 * one each time.
 */
const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://aq:aq@localhost:5432/airquality",
  });

if (process.env.NODE_ENV !== "production") globalForPg.pool = pool;

export async function query<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
