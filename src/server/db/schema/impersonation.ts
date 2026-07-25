import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";
import { tenants } from "./tenants";

/**
 * Support impersonation sessions (spec §4.1, §20, §23).
 *
 * Server-side and time-boxed: the cookie holds only this row's opaque id, and
 * every request re-checks that the row is live (`ended_at IS NULL`,
 * `expires_at > now()`) and that `actor_user_id` matches the currently
 * authenticated platform admin. That the state lives here, not in the cookie,
 * is what makes an impersonation revocable and forcibly expirable.
 */
export const impersonationSessions = pgTable(
  "impersonation_sessions",
  {
    id: primaryId(),
    actorUserId: uuid("actor_user_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reason: text("reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("impersonation_actor_idx").on(table.actorUserId)],
);

export type ImpersonationSession = typeof impersonationSessions.$inferSelect;
export type NewImpersonationSession = typeof impersonationSessions.$inferInsert;
