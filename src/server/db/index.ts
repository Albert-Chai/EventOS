import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env, isProduction } from "@/config/env";

import * as schema from "./schema";

/**
 * Database connection.
 *
 * Serverless functions are short-lived and can each open a pool, so we cap
 * connections low and rely on Supabase's PgBouncer (`DATABASE_URL`, port 6543).
 * `prepare: false` is required: PgBouncer in transaction mode does not support
 * prepared statements.
 *
 * Migrations use `DIRECT_DATABASE_URL` (port 5432) instead — see drizzle.config.ts.
 */

const createConnection = () =>
  postgres(env.DATABASE_URL, {
    max: isProduction ? 5 : 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

// Reuse the connection across hot reloads in development; without this, every
// file save leaks a pool until Postgres refuses new connections.
const globalForDb = globalThis as unknown as { __eventosSql?: ReturnType<typeof createConnection> };

const sql = globalForDb.__eventosSql ?? createConnection();
if (!isProduction) globalForDb.__eventosSql = sql;

export const db = drizzle(sql, { schema });

export { sql, schema };
export type Database = typeof db;
