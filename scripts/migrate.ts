/**
 * Applies pending migrations using the DIRECT connection.
 *
 * Run with `pnpm db:migrate`. Uses the direct URL (port 5432) because DDL
 * through PgBouncer's transaction pooling is unreliable.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) {
    console.error("DIRECT_DATABASE_URL is not set. Copy .env.example to .env.local first.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log("Applying migrations...");
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
