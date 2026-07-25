import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, softDelete, timestamps } from "./_shared";

/**
 * An organizer workspace (spec §5, §8.2, §13). The root of the tenant tree —
 * every tenant-scoped table added from here on carries `tenant_id` referencing
 * this table.
 */

/** Documented status set. `active` on creation; `suspended` by a platform admin. */
export type TenantStatus = "active" | "suspended";

export const tenants = pgTable(
  "tenants",
  {
    id: primaryId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    legalName: text("legal_name"),
    registrationNumber: text("registration_number"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    country: text("country").notNull().default("MY"),
    timezone: text("timezone").notNull().default("Asia/Kuala_Lumpur"),
    currency: text("currency").notNull().default("MYR"),
    status: text("status").notNull().default("active").$type<TenantStatus>(),
    // Placeholder until the plans table lands in Phase 6 (billing). Not an FK yet.
    plan: text("plan").notNull().default("starter"),
    customDomain: text("custom_domain"),
    logoFileId: uuid("logo_file_id"),
    createdBy: uuid("created_by"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    // Case-insensitive uniqueness is enforced by an expression index in the
    // hand-written migration (Drizzle cannot express `lower(slug)`).
    index("tenants_status_idx").on(table.status),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
