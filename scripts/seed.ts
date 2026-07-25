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
import { and, eq, sql as raw } from "drizzle-orm";

import {
  eventBranding,
  eventOperatingHours,
  eventSettings,
  events,
  platformAdmins,
  profiles,
  tenantMemberRoles,
  tenantMembers,
  tenants,
} from "../src/server/db/schema";
import type { EventType } from "../src/server/events/event-types";
import type { EventStatus } from "../src/server/events/status";

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

/**
 * Supabase's auth API intermittently rejects a valid secret key with
 * `bad_jwt` / "unrecognized JWT kid <nil> for algorithm ES256" — observed at
 * roughly one call in three against a project using the new asymmetric signing
 * keys. The same call succeeds on retry, so it is a transient fault on their
 * side rather than a credential problem.
 *
 * Retried here rather than reported, because a seed that dies a third of the
 * way through is worse than a seed that takes an extra second.
 */
const TRANSIENT = /bad_jwt|unrecognized JWT kid|token is unverifiable|5\d\d/i;

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT.test(message) || attempt === attempts) break;

      const backoffMs = 250 * 2 ** (attempt - 1);
      console.log(
        `    ↻ ${label}: transient error, retrying in ${backoffMs}ms (${attempt}/${attempts - 1})`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed a production environment.");
    process.exit(1);
  }

  const databaseUrl = requireEnv("DIRECT_DATABASE_URL");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SECRET_KEY");

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
  const db = drizzle(sql, {
    schema: {
      profiles,
      tenants,
      tenantMembers,
      tenantMemberRoles,
      platformAdmins,
      events,
      eventSettings,
      eventBranding,
      eventOperatingHours,
    },
  });
  const userIds = new Map<string, string>();

  try {
    console.log("Seeding users...\n");

    for (const user of USERS) {
      // createUser is idempotent-by-error: an existing address returns a
      // duplicate error rather than a row, so fall back to a lookup.
      const { userId, existed } = await withRetry(user.email, async () => {
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: SEED_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: user.displayName, seed_role: user.role },
        });

        if (!error) return { userId: data.user!.id, existed: false };

        // Anything that is not a duplicate — including the transient JWT
        // fault — is rethrown so withRetry can decide whether to retry.
        if (!/already been registered|already exists/i.test(error.message)) throw error;

        const { data: list, error: listError } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listError) throw listError;

        const found = list.users.find((candidate) => candidate.email === user.email);
        if (!found) throw new Error(`Could not resolve existing user ${user.email}`);
        return { userId: found.id, existed: true };
      });

      console.log(
        `  ${existed ? "=" : "+"} ${user.email.padEnd(34)} (${existed ? "exists" : "created"})`,
      );
      userIds.set(user.email, userId);

      // The on_auth_user_created trigger normally does this; upsert anyway so
      // the seed also repairs a database migrated after its users were made.
      await db
        .insert(profiles)
        .values({ id: userId, email: user.email, displayName: user.displayName })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { displayName: user.displayName, updatedAt: new Date() },
        });
    }

    // --- Phase 1: platform admin + a demo tenant with its owner --------------
    console.log("\nSeeding platform + tenant...\n");

    const platformAdminId = userIds.get("platform.admin@eventos.test")!;
    await db
      .insert(platformAdmins)
      .values({ userId: platformAdminId, note: "Seeded platform administrator" })
      .onConflictDoNothing({ target: platformAdmins.userId });
    console.log("  + platform.admin@eventos.test        (platform admin)");

    const demoSlug = "kl-food-weekend";
    const [existingTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, demoSlug))
      .limit(1);
    const tenant =
      existingTenant ??
      (
        await db
          .insert(tenants)
          .values({
            name: "Kuala Lumpur Food Discovery Weekend",
            slug: demoSlug,
            contactEmail: "organizer.owner@eventos.test",
            createdBy: platformAdminId,
          })
          .returning()
      )[0];
    console.log(
      `  ${existingTenant ? "=" : "+"} ${tenant.name} (${existingTenant ? "exists" : "created"})`,
    );

    // Owner + one staff member so the switcher and role logic have real data.
    const memberSeeds: Array<{ email: string; roleKey: string }> = [
      { email: "organizer.owner@eventos.test", roleKey: "owner" },
      { email: "organizer.staff@eventos.test", roleKey: "event_manager" },
    ];
    for (const seed of memberSeeds) {
      const userId = userIds.get(seed.email)!;
      const [member] = await db
        .insert(tenantMembers)
        .values({ tenantId: tenant.id, userId, status: "active", joinedAt: new Date() })
        .onConflictDoUpdate({
          target: [tenantMembers.tenantId, tenantMembers.userId],
          set: { status: "active" },
        })
        .returning();
      await db
        .insert(tenantMemberRoles)
        .values({ tenantMemberId: member.id, roleKey: seed.roleKey })
        .onConflictDoNothing();
      console.log(`  + ${seed.email.padEnd(34)} (${seed.roleKey})`);
    }

    // --- Phase 2: demo events (one published, one draft) --------------------
    console.log("\nSeeding events...\n");
    const ownerId = userIds.get("organizer.owner@eventos.test")!;
    const DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const isoDate = (offsetDays: number) =>
      new Date(now.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
    const at = (offsetDays: number, hour: number) => {
      const d = new Date(now.getTime() + offsetDays * DAY);
      d.setHours(hour, 0, 0, 0);
      return d;
    };

    async function ensureEvent(input: {
      slug: string;
      name: string;
      eventType: EventType;
      status: EventStatus;
      published: boolean;
      shortDescription: string;
      description: string;
      venueName: string | null;
      venueAddress: string | null;
      latitude: number | null;
      longitude: number | null;
      startAt: Date | null;
      endAt: Date | null;
      theme: string;
      primaryColor: string;
      hours: { date: string; opensAt: string; closesAt: string }[];
    }) {
      const [existing] = await db
        .select()
        .from(events)
        .where(and(eq(events.tenantId, tenant.id), eq(events.slug, input.slug)))
        .limit(1);
      if (existing) {
        console.log(`  = ${input.name.padEnd(30)} (exists)`);
        return;
      }

      const [event] = await db
        .insert(events)
        .values({
          tenantId: tenant.id,
          name: input.name,
          slug: input.slug,
          eventType: input.eventType,
          status: input.status,
          shortDescription: input.shortDescription,
          description: input.description,
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          latitude: input.latitude,
          longitude: input.longitude,
          startAt: input.startAt,
          endAt: input.endAt,
          publishedAt: input.published ? now : null,
          createdBy: ownerId,
        })
        .returning();

      await db.insert(eventSettings).values({ tenantId: tenant.id, eventId: event.id });
      await db.insert(eventBranding).values({
        tenantId: tenant.id,
        eventId: event.id,
        theme: input.theme,
        primaryColor: input.primaryColor,
      });
      if (input.hours.length > 0) {
        await db.insert(eventOperatingHours).values(
          input.hours.map((h) => ({
            tenantId: tenant.id,
            eventId: event.id,
            date: h.date,
            opensAt: h.opensAt,
            closesAt: h.closesAt,
            isClosed: false,
          })),
        );
      }
      console.log(`  + ${input.name.padEnd(30)} (${input.status})`);
    }

    await ensureEvent({
      slug: "street-eats",
      name: "KL Street Eats Weekend",
      eventType: "food_festival",
      status: "published",
      published: true,
      shortDescription: "Three days of the city's best hawker stalls under one roof.",
      description:
        "Join us at Central Market for a weekend celebrating Kuala Lumpur's street food. " +
        "Dozens of stalls, live music, and family-friendly fun from Friday to Sunday.",
      venueName: "Central Market",
      venueAddress: "Jalan Hang Kasturi, 50050 Kuala Lumpur",
      latitude: 3.1427,
      longitude: 101.6952,
      startAt: at(14, 17),
      endAt: at(16, 23),
      theme: "vibrant",
      primaryColor: "#c2410c",
      hours: [
        { date: isoDate(14), opensAt: "17:00", closesAt: "23:00" },
        { date: isoDate(15), opensAt: "12:00", closesAt: "23:00" },
        { date: isoDate(16), opensAt: "12:00", closesAt: "22:00" },
      ],
    });

    await ensureEvent({
      slug: "ramadan-bazaar-trial",
      name: "Ramadan Bazaar Trial",
      eventType: "night_market",
      status: "draft",
      published: false,
      shortDescription: "A draft event — not visible to the public yet.",
      description: "Still being set up. Used to demonstrate that drafts return 404 publicly.",
      venueName: null,
      venueAddress: null,
      latitude: null,
      longitude: null,
      startAt: null,
      endAt: null,
      theme: "classic",
      primaryColor: "#0f172a",
      hours: [],
    });

    const [{ count }] = await db.execute<{ count: string }>(
      raw`select count(*)::text as count from profiles`,
    );

    console.log(`\nDone. ${count} profile(s), 1 tenant, 1 platform admin, 2 events.`);
    console.log(`Password for every seeded account: ${SEED_PASSWORD}`);
    console.log("\nSign in as:");
    console.log("  platform.admin@eventos.test   → /platform (platform admin)");
    console.log("  organizer.owner@eventos.test  → owner of Kuala Lumpur Food Discovery Weekend");
    console.log("  organizer.staff@eventos.test  → event manager in that workspace");
    console.log("\nPublic pages:");
    console.log("  /kl-food-weekend               → the workspace's public event index");
    console.log("  /kl-food-weekend/street-eats   → a published event (draft trial 404s)");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
