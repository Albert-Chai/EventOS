import { index, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { files } from "./files";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";
import { visitors } from "./visitors";

/**
 * A "moment" — a visitor's post about an event (docs/phase-10-moments-plan.md):
 * a photo and/or a caption, optionally tagged to a stall and rated 1–5.
 *
 * Tenant-scoped like every other table, even though the author is a visitor
 * rather than a member: the content belongs to the organizer's event, so it
 * scopes, moderates, and cascades with it.
 *
 * Absent from this file on purpose (§4 — Drizzle can't express them; see the
 * hand-written companion migration):
 *
 *  - the cross-schema FK `author_user_id → auth.users ON DELETE SET NULL`
 *  - CHECK `rating BETWEEN 1 AND 5`
 *  - CHECK `rating IS NULL OR participation_id IS NOT NULL` — a star has to be
 *    about something
 *  - CHECK a post has a non-blank body OR an image — "text-only allowed" is not
 *    "empty allowed"
 *  - the partial feed index (status = 'published')
 *  - `set_updated_at` and the `REVOKE ALL … FROM anon, authenticated`
 */
export const momentPosts = pgTable(
  "moment_posts",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    visitorId: uuid("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    // Nullable so deleting an account doesn't take the event's content with it;
    // `visitor_id` remains the authoritative owner for permission checks.
    authorUserId: uuid("author_user_id"),

    /** The tagged stall. Null for a post about the event in general. */
    participationId: uuid("participation_id").references(() => merchantEventParticipations.id, {
      onDelete: "set null",
    }),
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),

    body: text("body"),
    rating: smallint("rating"),

    /** `published` | `hidden` | `deleted` — see server/moments/status.ts. */
    status: text("status").notNull().default("published"),

    /** Moderation is accountable: who hid it, when, and why. */
    hiddenReason: text("hidden_reason"),
    hiddenBy: uuid("hidden_by"),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index("moment_posts_tenant_idx").on(table.tenantId),
    index("moment_posts_event_created_idx").on(table.eventId, table.createdAt),
    index("moment_posts_participation_idx").on(table.participationId),
    index("moment_posts_visitor_idx").on(table.visitorId),
  ],
);

export type MomentPost = typeof momentPosts.$inferSelect;
export type NewMomentPost = typeof momentPosts.$inferInsert;
