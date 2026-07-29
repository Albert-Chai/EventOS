import { boolean, index, pgTable, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { tenants } from "./tenants";

/**
 * Per-event feature toggles (spec §8.3, "Event settings"). A 1:1 satellite of
 * `events` — one row is created with the event (defaults below), so a settings
 * read never misses. Carries `tenant_id` like every tenant-scoped table, and
 * cascades when its event is deleted.
 *
 * Some toggles gate features that arrive in later phases (reviews, vouchers,
 * passport, maps, sponsors). They are defined now so the event configuration
 * surface is complete and stable; each phase wires its own enforcement.
 */
export const eventSettings = pgTable(
  "event_settings",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),

    requireVisitorLogin: boolean("require_visitor_login").notNull().default(false),
    enableFavourites: boolean("enable_favourites").notNull().default(true),
    enableReviews: boolean("enable_reviews").notNull().default(false),
    enableVouchers: boolean("enable_vouchers").notNull().default(false),
    enableSponsors: boolean("enable_sponsors").notNull().default(false),
    enableMoments: boolean("enable_moments").notNull().default(false),
    enablePassport: boolean("enable_passport").notNull().default(false),
    enableMaps: boolean("enable_maps").notNull().default(true),
    enableMerchantSelfRegistration: boolean("enable_merchant_self_registration")
      .notNull()
      .default(false),
    enableGuestBrowsing: boolean("enable_guest_browsing").notNull().default(true),
    showMerchantPrices: boolean("show_merchant_prices").notNull().default(true),
    showBoothNumber: boolean("show_booth_number").notNull().default(true),
    showOperatingHours: boolean("show_operating_hours").notNull().default(true),
    showSocialLinks: boolean("show_social_links").notNull().default(true),

    ...timestamps,
  },
  (table) => [
    unique("event_settings_event_uq").on(table.eventId),
    index("event_settings_tenant_idx").on(table.tenantId),
  ],
);

export type EventSettings = typeof eventSettings.$inferSelect;
export type NewEventSettings = typeof eventSettings.$inferInsert;

/** The boolean toggle keys, for building forms and typed patches. */
export const EVENT_SETTING_KEYS = [
  "requireVisitorLogin",
  "enableFavourites",
  "enableReviews",
  "enableVouchers",
  "enableSponsors",
  "enableMoments",
  "enablePassport",
  "enableMaps",
  "enableMerchantSelfRegistration",
  "enableGuestBrowsing",
  "showMerchantPrices",
  "showBoothNumber",
  "showOperatingHours",
  "showSocialLinks",
] as const;

export type EventSettingKey = (typeof EVENT_SETTING_KEYS)[number];
