import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";

/**
 * A visitor (spec §8.8) — a person browsing the public event site. Identified by
 * an opaque anonymous id carried in an httpOnly cookie (`eventos_vid`), created
 * lazily on the first favourite/view, so anonymous browsing writes nothing.
 *
 * NOT tenant-scoped: one device can browse several organizers' events, and each
 * organizer only ever sees the visitor's rows scoped to their own tenant (via
 * `visitor_favourites` / `visitor_recent_views`, which carry `tenant_id`).
 *
 * `user_id → auth.users` is reserved for a future anonymous→account link and is a
 * hand-written cross-schema FK. Profile fields (`display_name`, `email`) exist for
 * that link; registration itself is deferred (see docs/phase-5-plan.md).
 */
export const visitors = pgTable(
  "visitors",
  {
    id: primaryId(),
    anonymousId: text("anonymous_id").notNull(),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    userId: uuid("user_id"),
    displayName: text("display_name"),
    email: text("email"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [unique("visitors_anonymous_id_uq").on(table.anonymousId)],
);

export type Visitor = typeof visitors.$inferSelect;
export type NewVisitor = typeof visitors.$inferInsert;
