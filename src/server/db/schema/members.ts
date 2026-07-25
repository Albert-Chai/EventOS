import { index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { roles } from "./roles";
import { tenants } from "./tenants";

/**
 * Tenant membership and role assignment (spec §5, §4.2–4.3).
 *
 * A user belongs to a tenant through `tenant_members`; what they may do there is
 * the union of the roles in `tenant_member_roles`. Both are tenant-scoped and
 * only ever queried through the repository layer with a resolved tenant id.
 */

export type MemberStatus = "invited" | "active" | "suspended" | "removed";

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    userId: uuid("user_id").notNull(),
    status: text("status").notNull().default("active").$type<MemberStatus>(),
    invitedBy: uuid("invited_by"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("tenant_members_tenant_user_uq").on(table.tenantId, table.userId),
    index("tenant_members_user_idx").on(table.userId),
    index("tenant_members_tenant_idx").on(table.tenantId),
  ],
);

export const tenantMemberRoles = pgTable(
  "tenant_member_roles",
  {
    tenantMemberId: uuid("tenant_member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    roleKey: text("role_key")
      .notNull()
      .references(() => roles.key, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.tenantMemberId, table.roleKey] })],
);

/**
 * Email invitations (spec §4.2, §23). Distinct from `tenant_members` because an
 * invite can precede the invitee having an account. On acceptance we create the
 * member and its roles, then mark the invite accepted.
 *
 * The token itself is never stored — only a SHA-256 hash — so a database leak
 * cannot be replayed as a valid invitation link.
 */
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export const tenantInvitations = pgTable(
  "tenant_invitations",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleKeys: text("role_keys").array().notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("pending").$type<InvitationStatus>(),
    invitedBy: uuid("invited_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id"),
    ...timestamps,
  },
  (table) => [
    unique("tenant_invitations_token_hash_uq").on(table.tokenHash),
    index("tenant_invitations_tenant_idx").on(table.tenantId),
    index("tenant_invitations_email_idx").on(table.email),
  ],
);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type NewTenantMember = typeof tenantMembers.$inferInsert;
export type TenantMemberRole = typeof tenantMemberRoles.$inferSelect;
export type TenantInvitation = typeof tenantInvitations.$inferSelect;
export type NewTenantInvitation = typeof tenantInvitations.$inferInsert;
