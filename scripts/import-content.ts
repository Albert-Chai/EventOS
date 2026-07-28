import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Own connection + env-free imports only (like seed.ts / migrate.ts): importing
// the app's `@/server/db` client would eagerly validate the full Next.js env
// (NEXT_PUBLIC_* etc.), which a plain script doesn't have. The schema barrel is
// just table definitions, so it carries no env.
import * as schema from "@/server/db/schema";
import { slugify } from "@/lib/slug";
import { EVENT_TYPES, EVENT_VISIBILITIES, type EventType, type EventVisibility } from "@/server/events/event-types";
import { ITEM_AVAILABILITIES, type ItemAvailability } from "@/server/merchants/status";
import { VOUCHER_STATUSES, VOUCHER_TYPES, type VoucherStatus, type VoucherType } from "@/server/vouchers/status";

const {
  eventBranding,
  eventSettings,
  events,
  featuredPlacements,
  listingItems,
  merchantCategories,
  merchantEventParticipations,
  merchants,
  profiles,
  tenantMemberRoles,
  tenantMembers,
  tenants,
  vouchers,
  zones,
} = schema;

// Prefer the DIRECT (session) connection for a bulk write script; fall back to
// the pooler. `max: 1` + sequential writes keeps us clear of the pooler's
// concurrent-query stalls.
const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) in .env.local first.");
  process.exit(1);
}
const sql = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

/**
 * Content importer (dev tooling). Reads the fill-in CSVs in `content-template/`
 * and rebuilds ONE organizer workspace from them, so the visitor experience can
 * be reviewed with real content without hand-creating anything.
 *
 * Re-running REPLACES that workspace entirely (delete-by-slug → cascade, then
 * re-insert), so iterating on the CSVs is safe. All writes are sequential — the
 * dev/test pooler connection cap (`max: 1`) stalls on concurrent bursts.
 *
 * Not a production path: it writes application tables directly (like the seed),
 * and every row's `tenant_id` is the workspace this script just created.
 */

const DIR = join(process.cwd(), "content-template");
const RESERVED_SLUGS = new Set(["kl-food-weekend"]); // the demo seed workspace

type Row = Record<string, string>;

// --- tiny RFC-4180 CSV parser (quotes, embedded commas/newlines) -----------
function parseCsv(text: string): Row[] {
  const src = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== "")) // drop blank lines
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function readCsv(name: string): Row[] {
  const path = join(DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Missing ${name} in content-template/. Expected at ${path}`);
  }
  return parseCsv(readFileSync(path, "utf8"));
}

// --- coercion helpers ------------------------------------------------------
const yn = (v: string | undefined): boolean => /^(y|yes|true|1)$/i.test((v ?? "").trim());
const orNull = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
const intOrNull = (v: string | undefined): number | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};
const centsOrNull = (v: string | undefined): number | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const dateOrNull = (v: string | undefined, endOfDay = false): Date | null => {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T${endOfDay ? "23:59:59" : "00:00:00"}` : t;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function main(): Promise<void> {
  const errors: string[] = [];
  const req = (cond: boolean, msg: string) => {
    if (!cond) errors.push(msg);
  };
  const inSet = (v: string, set: readonly string[]) => set.includes(v);

  // --- read ---------------------------------------------------------------
  const weRows = readCsv("workspace-and-event.csv");
  const merchantRows = readCsv("merchants.csv");
  const itemRows = readCsv("menu-items.csv");
  const voucherRows = readCsv("vouchers.csv");

  req(weRows.length === 1, `workspace-and-event.csv must have exactly one data row (found ${weRows.length}).`);
  const we = weRows[0] ?? {};

  // --- validate (no DB writes until this passes) --------------------------
  for (const [k, label] of [
    ["workspace_name", "workspace_name"],
    ["workspace_slug", "workspace_slug"],
    ["event_name", "event_name"],
    ["event_slug", "event_slug"],
    ["event_type", "event_type"],
    ["start_date", "start_date"],
    ["end_date", "end_date"],
  ] as const) {
    req(Boolean(orNull(we[k])), `workspace-and-event.csv: ${label} is required.`);
  }
  if (we.workspace_slug) {
    req(!RESERVED_SLUGS.has(we.workspace_slug.trim()), `workspace_slug '${we.workspace_slug}' is reserved for the demo seed — pick another.`);
  }
  if (we.event_type) req(inSet(we.event_type, EVENT_TYPES), `event_type '${we.event_type}' is invalid. Allowed: ${EVENT_TYPES.join(", ")}.`);
  if (orNull(we.visibility)) req(inSet(we.visibility, EVENT_VISIBILITIES), `visibility '${we.visibility}' is invalid. Allowed: ${EVENT_VISIBILITIES.join(", ")}.`);
  req(dateOrNull(we.start_date) !== null, `start_date '${we.start_date}' is not a valid YYYY-MM-DD date.`);
  req(dateOrNull(we.end_date) !== null, `end_date '${we.end_date}' is not a valid YYYY-MM-DD date.`);

  const merchantSlugs = new Set<string>();
  merchantRows.forEach((m, i) => {
    const n = i + 2;
    req(Boolean(orNull(m.merchant_slug)), `merchants.csv row ${n}: merchant_slug is required.`);
    req(Boolean(orNull(m.merchant_name)), `merchants.csv row ${n}: merchant_name is required.`);
    if (m.merchant_slug) {
      if (merchantSlugs.has(m.merchant_slug)) errors.push(`merchants.csv row ${n}: duplicate merchant_slug '${m.merchant_slug}'.`);
      merchantSlugs.add(m.merchant_slug);
    }
  });

  itemRows.forEach((it, i) => {
    const n = i + 2;
    req(Boolean(orNull(it.item_name)), `menu-items.csv row ${n}: item_name is required.`);
    req(merchantSlugs.has(it.merchant_slug), `menu-items.csv row ${n}: merchant_slug '${it.merchant_slug}' has no matching merchant.`);
    if (orNull(it.availability)) req(inSet(it.availability, ITEM_AVAILABILITIES), `menu-items.csv row ${n}: availability '${it.availability}' invalid. Allowed: ${ITEM_AVAILABILITIES.join(", ")}.`);
  });

  voucherRows.forEach((v, i) => {
    const n = i + 2;
    req(Boolean(orNull(v.title)), `vouchers.csv row ${n}: title is required.`);
    req(inSet(v.type, VOUCHER_TYPES), `vouchers.csv row ${n}: type '${v.type}' invalid. Allowed: ${VOUCHER_TYPES.join(", ")}.`);
    if (orNull(v.status)) req(inSet(v.status, VOUCHER_STATUSES), `vouchers.csv row ${n}: status '${v.status}' invalid. Allowed: ${VOUCHER_STATUSES.join(", ")}.`);
    if (orNull(v.merchant_slug)) req(merchantSlugs.has(v.merchant_slug), `vouchers.csv row ${n}: merchant_slug '${v.merchant_slug}' has no matching merchant.`);
  });

  if (errors.length > 0) {
    console.error(`\n✗ Import aborted — ${errors.length} problem(s) found:\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error("\nFix the CSVs and re-run. Nothing was written.\n");
    process.exit(1);
  }

  // --- resolve the organizer owner (for dashboard access; best-effort) ----
  const [owner] = await db.select().from(profiles).where(eq(profiles.email, "organizer.owner@eventos.test")).limit(1);
  const ownerId = owner?.id ?? null;

  // --- one atomic rebuild: delete-by-slug, then bulk-insert everything -----
  // Batched inserts inside a single transaction keep the whole rebuild to a
  // handful of round-trips (it was ~160 one-at-a-time inserts). On a flaky link
  // that shrinks the window for a dropped connection, and a failure now rolls
  // back cleanly instead of leaving a half-built workspace behind.
  const wSlug = we.workspace_slug.trim();

  const built = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(tenants).where(eq(tenants.slug, wSlug)).limit(1);
    const replaced = Boolean(existing);
    if (existing) await tx.delete(tenants).where(eq(tenants.id, existing.id));

    const now = new Date();

    // workspace + membership
    const [tenant] = await tx
      .insert(tenants)
      .values({ name: we.workspace_name.trim(), slug: wSlug, status: "active", createdBy: ownerId })
      .returning();

    if (ownerId) {
      const [member] = await tx
        .insert(tenantMembers)
        .values({ tenantId: tenant.id, userId: ownerId, status: "active", joinedAt: now })
        .returning();
      await tx.insert(tenantMemberRoles).values({ tenantMemberId: member.id, roleKey: "owner" });
    }

    // event + settings + branding
    const [event] = await tx
      .insert(events)
      .values({
        tenantId: tenant.id,
        name: we.event_name.trim(),
        slug: we.event_slug.trim(),
        eventType: we.event_type as EventType, // validated above
        shortDescription: orNull(we.short_description),
        description: orNull(we.description),
        venueName: orNull(we.venue_name),
        venueAddress: orNull(we.venue_address),
        timezone: orNull(we.timezone) ?? "Asia/Kuala_Lumpur",
        startAt: dateOrNull(we.start_date),
        endAt: dateOrNull(we.end_date, true),
        status: "published",
        visibility: (orNull(we.visibility) ?? "public") as EventVisibility,
        publishedAt: now,
        createdBy: ownerId,
      })
      .returning();

    await tx.insert(eventSettings).values({
      tenantId: tenant.id,
      eventId: event.id,
      enableVouchers: yn(we.enable_vouchers) || voucherRows.length > 0,
      enableMaps: yn(we.enable_maps),
    });
    await tx.insert(eventBranding).values({
      tenantId: tenant.id,
      eventId: event.id,
      primaryColor: orNull(we.primary_color) ?? "#0f172a",
    });

    // categories (bulk) — from distinct merchant categories
    const catNames = [
      ...new Set(merchantRows.map((m) => orNull(m.category)).filter((v): v is string => v !== null)),
    ];
    const catId = new Map<string, string>();
    if (catNames.length) {
      const rows = await tx
        .insert(merchantCategories)
        .values(catNames.map((name) => ({ tenantId: tenant.id, name, slug: slugify(name) })))
        .returning({ id: merchantCategories.id, name: merchantCategories.name });
      for (const c of rows) catId.set(c.name, c.id);
    }

    // zones (bulk) — from distinct merchant zones
    const zoneNames = [
      ...new Set(merchantRows.map((m) => orNull(m.zone)).filter((v): v is string => v !== null)),
    ];
    if (zoneNames.length) {
      await tx.insert(zones).values(
        zoneNames.map((name, i) => ({ tenantId: tenant.id, eventId: event.id, name, displayOrder: i })),
      );
    }

    // merchants (bulk) → slug → id
    const merchantIdBySlug = new Map<string, string>();
    const mRows = await tx
      .insert(merchants)
      .values(
        merchantRows.map((m) => ({
          tenantId: tenant.id,
          name: m.merchant_name.trim(),
          slug: m.merchant_slug.trim(),
          categoryId: orNull(m.category) ? (catId.get(m.category.trim()) ?? null) : null,
          description: orNull(m.description),
          contactEmail: orNull(m.contact_email),
          contactPhone: orNull(m.contact_phone),
          website: orNull(m.website),
          status: "active" as const,
          createdBy: ownerId,
        })),
      )
      .returning({ id: merchants.id, slug: merchants.slug });
    for (const r of mRows) merchantIdBySlug.set(r.slug, r.id);

    // participations (bulk) → slug → participationId, assigning featured ranks
    let featuredRank = 0;
    const pRows = await tx
      .insert(merchantEventParticipations)
      .values(
        merchantRows.map((m) => ({
          tenantId: tenant.id,
          eventId: event.id,
          merchantId: merchantIdBySlug.get(m.merchant_slug.trim())!,
          listingTitle: orNull(m.listing_title) ?? m.merchant_name.trim(),
          listingDescription: orNull(m.listing_description) ?? orNull(m.description),
          approvalStatus: "approved" as const,
          submittedAt: now,
          approvedAt: now,
          reviewedBy: ownerId,
          featuredRank: yn(m.featured) ? ++featuredRank : null,
        })),
      )
      .returning({
        id: merchantEventParticipations.id,
        merchantId: merchantEventParticipations.merchantId,
      });
    const participationIdByMerchantId = new Map(pRows.map((r) => [r.merchantId, r.id]));
    const participationIdBySlug = new Map<string, string>();
    for (const [slug, mid] of merchantIdBySlug) {
      participationIdBySlug.set(slug, participationIdByMerchantId.get(mid)!);
    }

    // featured placements (bulk, featured only). A featured merchant needs BOTH:
    // featured_rank (above) boosts it in the directory SQL, and an open
    // featured_placement is what drives the ★ badge + the landing highlight
    // (listFeaturedParticipationIds). featureMerchant() writes both in the app.
    const featuredMerchants = merchantRows.filter((m) => yn(m.featured));
    if (featuredMerchants.length) {
      await tx.insert(featuredPlacements).values(
        featuredMerchants.map((m, i) => ({
          tenantId: tenant.id,
          eventId: event.id,
          participationId: participationIdBySlug.get(m.merchant_slug.trim())!,
          merchantId: merchantIdBySlug.get(m.merchant_slug.trim())!,
          placementType: "homepage_featured" as const,
          rankPriority: i + 1,
          paymentStatus: "included" as const,
          createdBy: ownerId,
        })),
      );
    }

    // listing items (bulk)
    if (itemRows.length) {
      await tx.insert(listingItems).values(
        itemRows.map((it) => {
          const slug = it.merchant_slug.trim();
          return {
            tenantId: tenant.id,
            participationId: participationIdBySlug.get(slug)!,
            merchantId: merchantIdBySlug.get(slug)!,
            eventId: event.id,
            name: it.item_name.trim(),
            description: orNull(it.description),
            price: orNull(it.price),
            promoPrice: orNull(it.promo_price),
            currency: orNull(it.currency) ?? "MYR",
            dietaryTags: orNull(it.dietary_tags)
              ? it.dietary_tags.split(";").map((s) => s.trim()).filter(Boolean)
              : [],
            isHalal: yn(it.is_halal),
            availability: (orNull(it.availability) ?? "available") as ItemAvailability,
            displayOrder: intOrNull(it.display_order) ?? 0,
          };
        }),
      );
    }

    // vouchers (bulk)
    if (voucherRows.length) {
      await tx.insert(vouchers).values(
        voucherRows.map((v) => ({
          tenantId: tenant.id,
          eventId: event.id,
          merchantId: orNull(v.merchant_slug)
            ? (merchantIdBySlug.get(v.merchant_slug.trim()) ?? null)
            : null,
          title: v.title.trim(),
          description: orNull(v.description),
          terms: orNull(v.terms),
          voucherType: v.type as VoucherType, // validated above
          discountPercent: intOrNull(v.discount_percent),
          discountAmountCents: centsOrNull(v.discount_amount),
          currency: "MYR",
          minSpendCents: centsOrNull(v.min_spend),
          status: (orNull(v.status) ?? "active") as VoucherStatus,
          startsAt: dateOrNull(v.starts_date),
          endsAt: dateOrNull(v.ends_date, true),
          totalQuantity: intOrNull(v.total_quantity),
          perVisitorLimit: intOrNull(v.per_visitor_limit) ?? 1,
        })),
      );
    }

    return { tenant, event, replaced, categories: catId.size, zones: zoneNames.length, featured: featuredMerchants.length };
  });

  const { tenant, event } = built;
  if (built.replaced) console.log(`  ~ replaced existing workspace '${wSlug}'`);
  console.log(`  + workspace ${tenant.name} (/${tenant.slug})`);
  console.log(
    ownerId
      ? "  + organizer.owner@eventos.test attached as owner"
      : "  ! organizer.owner@eventos.test not found — dashboard access skipped (public site still works). Run `pnpm db:seed` for the login accounts.",
  );
  console.log(`  + event ${event.name} (/${tenant.slug}/${event.slug}) [published]`);
  if (built.categories) console.log(`  + ${built.categories} categor${built.categories === 1 ? "y" : "ies"}`);
  if (built.zones) console.log(`  + ${built.zones} zone(s)`);
  console.log(
    `  + ${merchantRows.length} merchant(s) with approved listings` +
      (built.featured ? ` (${built.featured} featured)` : ""),
  );
  if (itemRows.length) console.log(`  + ${itemRows.length} menu item(s)`);
  if (voucherRows.length) console.log(`  + ${voucherRows.length} voucher(s)`);

  console.log(`\n✓ Imported. Visit:  /${tenant.slug}/${event.slug}`);
  console.log(`   directory:        /${tenant.slug}/${event.slug}/merchants`);
  if (yn(we.enable_vouchers) || voucherRows.length > 0) {
    console.log(`   vouchers:         /${tenant.slug}/${event.slug}/vouchers`);
  }
  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
