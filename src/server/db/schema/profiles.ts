import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Application-side user record.
 *
 * Supabase owns `auth.users`; Drizzle must never generate a migration against
 * that schema. `profiles.id` mirrors `auth.users.id` and is populated by the
 * `on_auth_user_created` trigger (see drizzle/0001_auth_triggers.sql), so a
 * profile always exists by the time the user can sign in.
 *
 * Deliberately NOT declared here, and therefore invisible to `drizzle-kit
 * generate` (which diffs this file against the snapshot, so absent-from-both
 * means never touched):
 *   - the FK `profiles.id -> auth.users.id` — a cross-schema reference Drizzle
 *     cannot express
 *   - the unique index on `lower(email)` — an expression index
 * Both live in drizzle/0001_auth_triggers.sql. Adding either here would make
 * the next generated migration try to create it a second time.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
