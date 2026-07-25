import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

/**
 * System roles (spec §4.3). Seeded, not user-created, in Phase 1.
 *
 * The natural key is `key` (e.g. "owner"), which is what `tenant_member_roles`
 * references and what `src/server/authz/roles.ts` keys its permission map on.
 * Keeping the DB and the code aligned by a stable string key means neither has
 * to look up the other's surrogate id.
 */
export const roles = pgTable("roles", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export type Role = typeof roles.$inferSelect;
