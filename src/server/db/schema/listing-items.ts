import { boolean, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { ItemAvailability } from "../../merchants/status";
import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { files } from "./files";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";

/**
 * A product / menu item (spec §8.5, the generic `ListingItem`). Event-scoped:
 * it belongs to a merchant's participation in one event. Carries `tenant_id`,
 * `merchant_id`, and `event_id` too so every read can be scoped on whichever
 * axis is doing the asking (organizer by tenant, merchant by merchant).
 *
 * `price`/`promo_price` are `numeric` (returned as strings — money is never a
 * float). `image_file_id` is reserved for the deferred Storage upload flow.
 */
export const listingItems = pgTable(
  "listing_items",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id")
      .notNull()
      .references(() => merchantEventParticipations.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }),
    promoPrice: numeric("promo_price", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("MYR"),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    dietaryTags: text("dietary_tags").array().notNull().default([]),
    isHalal: boolean("is_halal").notNull().default(false),
    availability: text("availability").notNull().default("available").$type<ItemAvailability>(),
    displayOrder: integer("display_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("listing_items_participation_idx").on(table.participationId),
    index("listing_items_tenant_idx").on(table.tenantId),
    index("listing_items_merchant_idx").on(table.merchantId),
  ],
);

export type ListingItem = typeof listingItems.$inferSelect;
export type NewListingItem = typeof listingItems.$inferInsert;
