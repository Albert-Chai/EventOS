import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

/**
 * Platform super-admins (spec §4.1).
 *
 * A separate axis of authority from tenant membership — deliberately its own
 * table so it is granted and revoked explicitly, is auditable, and cannot be
 * conferred by an ordinary profile update. Keyed on the user id; FK to
 * auth.users is added in the hand-written migration.
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id").primaryKey(),
  grantedBy: uuid("granted_by"),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
  ...timestamps,
});

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
