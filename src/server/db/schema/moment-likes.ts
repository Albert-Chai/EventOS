import { index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { events } from "./events";
import { momentPosts } from "./moment-posts";
import { tenants } from "./tenants";
import { visitors } from "./visitors";

/**
 * A like on a moment. Append/delete only — no `updated_at`, no trigger, like
 * `visitor_favourites`: a like has no states, it either exists or it doesn't.
 *
 * `unique(moment_post_id, visitor_id)` is the whole integrity story. The service
 * toggles rather than counts, but the constraint is what makes "one like per
 * person" true under a double-tap or a racing retry.
 *
 * Liking requires a signed-in visitor, so `visitor_id` is always an
 * account-linked row. An anonymous like would be a count anyone could inflate by
 * clearing a cookie, which is worse than no count.
 *
 * `tenant_id`/`event_id` are carried (server-derived from the post's own row) so
 * likes scope to the event and cascade with it.
 */
export const momentLikes = pgTable(
  "moment_likes",
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("moment_likes_post_visitor_uq").on(table.momentPostId, table.visitorId),
    index("moment_likes_post_idx").on(table.momentPostId),
    index("moment_likes_visitor_idx").on(table.visitorId),
    index("moment_likes_tenant_idx").on(table.tenantId),
  ],
);

export type MomentLike = typeof momentLikes.$inferSelect;
export type NewMomentLike = typeof momentLikes.$inferInsert;
