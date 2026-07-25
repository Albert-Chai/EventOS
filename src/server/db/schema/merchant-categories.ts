import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { tenants } from "./tenants";

/**
 * Per-tenant merchant taxonomy (spec §8.4 "Category"). A small seeded list an
 * organizer can extend. Case-insensitive slug uniqueness within a tenant is a
 * partial expression index in the hand-written migration.
 */
export const merchantCategories = pgTable(
  "merchant_categories",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("merchant_categories_tenant_idx").on(table.tenantId)],
);

export type MerchantCategory = typeof merchantCategories.$inferSelect;
export type NewMerchantCategory = typeof merchantCategories.$inferInsert;
