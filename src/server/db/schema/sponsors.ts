import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { files } from "./files";
import { tenants } from "./tenants";
import type { SponsorStatus } from "../../ads/slots";

/**
 * An advertiser the organiser sells ad space to (docs/phase-9-sponsor-ads-plan.md).
 *
 * Tenant-scoped but **not** event-scoped: one sponsor can run flights across
 * several of the tenant's events, so the event lives on `ad_bookings`, not here.
 * Distinct from a `merchant` — a sponsor is an outside brand with no listing, no
 * portal login, and no participation in the event.
 *
 * `created_by` gets its `auth.users` FK in the hand-written migration (§4:
 * cross-schema FKs can't be expressed in Drizzle).
 */
export const sponsors = pgTable(
  "sponsors",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    contactEmail: text("contact_email"),
    logoFileId: uuid("logo_file_id").references(() => files.id, { onDelete: "set null" }),
    notes: text("notes"),
    status: text("status").notNull().default("active").$type<SponsorStatus>(),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    index("sponsors_tenant_idx").on(table.tenantId),
    // A tenant shouldn't end up with two sponsors of the same name by accident.
    unique("sponsors_tenant_name_key").on(table.tenantId, table.name),
  ],
);

export type Sponsor = typeof sponsors.$inferSelect;
export type NewSponsor = typeof sponsors.$inferInsert;
