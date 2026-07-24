/**
 * Development seed data (spec §38).
 *
 * Phase 0 seeds only what Phase 0 owns: auth users and their profiles. The
 * tenants, events, merchants, booths, and analytics rows listed in §38 arrive
 * as their phases land — seeding tables that do not exist yet is not possible,
 * and faking them would make the seed lie about the schema.
 *
 * Idempotent: re-running updates rather than duplicating.
 * Refuses to run against production.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { sql as raw } from "drizzle-orm";

import { profiles } from "../src/server/db/schema";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const SEED_PASSWORD = "eventos-dev-password";

const USERS = [
  { email: "platform.admin@eventos.test", displayName: "Platform Admin", role: "platform_admin" },
  { email: "organizer.owner@eventos.test", displayName: "Aisyah Rahman", role: "organizer_admin" },
  { email: "organizer.staff@eventos.test", displayName: "Daniel Lim", role: "organizer_staff" },
  { email: "merchant.owner@eventos.test", displayName: "Siti Nurhaliza", role: "merchant_admin" },
  { email: "visitor@eventos.test", displayName: "Wei Ming", role: "visitor" },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env.local first.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed a production environment.");
    process.exit(1);
  }

  const databaseUrl = requireEnv("DIRECT_DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Extra guard: the service role key can wipe a project, so make it hard to
  // point this at anything but a development database by accident.
  if (/\bprod\b/i.test(databaseUrl) || /\bprod\b/i.test(supabaseUrl)) {
    console.error('Connection string looks like production ("prod"). Refusing to seed.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema: { profiles } });

  try {
    console.log("Seeding users...\n");

    for (const user of USERS) {
      // createUser is idempotent-by-error: an existing address returns a
      // duplicate error rather than a row, so fall back to a lookup.
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: SEED_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: user.displayName, seed_role: user.role },
      });

      let userId = created?.user?.id;

      if (error) {
        if (!/already been registered|already exists/i.test(error.message)) {
          throw error;
        }
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = list?.users.find((candidate) => candidate.email === user.email)?.id;
        if (!userId) throw new Error(`Could not resolve existing user ${user.email}`);
        console.log(`  = ${user.email.padEnd(34)} (exists)`);
      } else {
        console.log(`  + ${user.email.padEnd(34)} (created)`);
      }

      // The on_auth_user_created trigger normally does this; upsert anyway so
      // the seed also repairs a database migrated after its users were made.
      await db
        .insert(profiles)
        .values({ id: userId!, email: user.email, displayName: user.displayName })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { displayName: user.displayName, updatedAt: new Date() },
        });
    }

    const [{ count }] = await db.execute<{ count: string }>(
      raw`select count(*)::text as count from profiles`,
    );

    console.log(`\nDone. ${count} profile(s) in the database.`);
    console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
    console.log("\nStill to come, as their phases land (spec §38):");
    console.log("  Phase 1 — tenants, memberships, roles");
    console.log("  Phase 2 — events");
    console.log("  Phase 3 — merchants, listing items");
    console.log("  Phase 4 — zones, booths, maps");
    console.log("  Phase 7 — analytics events");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
