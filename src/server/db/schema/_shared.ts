import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Column helpers shared across tenant-scoped tables so every table gets the
 * same id and timestamp shape (spec §12). `updated_at` is maintained by the
 * `set_updated_at` trigger applied in the hand-written migration.
 *
 * Status columns are plain `text` with a documented TS union rather than a
 * Postgres enum: the spec's status sets grow phase by phase, and altering an
 * enum type in place is far more painful than widening a union.
 */

export const primaryId = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Soft-delete marker for tables that need it. */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
