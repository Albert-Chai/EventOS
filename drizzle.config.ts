import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  throw new Error(
    "DIRECT_DATABASE_URL is not set. Migrations need the direct connection (port 5432), " +
      "not the pooler — PgBouncer transaction mode cannot run DDL reliably.",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  // Drizzle must only ever manage `public`. Supabase owns `auth`, `storage`,
  // and `realtime`; introspecting them would generate destructive migrations.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
});
