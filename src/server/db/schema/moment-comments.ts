import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { momentPosts } from "./moment-posts";
import { tenants } from "./tenants";
import { visitors } from "./visitors";

/**
 * A comment on a moment. Shares the post's moderation model exactly — same
 * status union, same accountable `hidden_*` trio — because a comment is
 * visitor-generated content on the organizer's event just as a post is, and
 * having two different moderation stories for the same surface would be a
 * mistake waiting to happen.
 *
 * Absent from this file on purpose (§4 — Drizzle can't express them; see the
 * hand-written companion migration):
 *
 *  - cross-schema FKs `author_user_id` / `hidden_by` → `auth.users`
 *  - CHECK that the body is not blank
 *  - the partial thread index (status = 'published')
 *  - `set_updated_at` and the `REVOKE ALL … FROM anon, authenticated`
 */
export const momentComments = pgTable(
  "moment_comments",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    momentPostId: uuid("moment_post_id")
      .notNull()
      .references(() => momentPosts.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    authorUserId: uuid("author_user_id"),

    body: text("body").notNull(),

    /** `published` | `hidden` | `deleted` — the same union posts use. */
    status: text("status").notNull().default("published"),
    hiddenReason: text("hidden_reason"),
    hiddenBy: uuid("hidden_by"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index("moment_comments_post_created_idx").on(table.momentPostId, table.createdAt),
    index("moment_comments_tenant_idx").on(table.tenantId),
    index("moment_comments_event_idx").on(table.eventId),
    index("moment_comments_visitor_idx").on(table.visitorId),
  ],
);

export type MomentComment = typeof momentComments.$inferSelect;
export type NewMomentComment = typeof momentComments.$inferInsert;
