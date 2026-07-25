import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import type { MerchantStatus } from "../../merchants/status";
import { primaryId, softDelete, timestamps } from "./_shared";
import { files } from "./files";
import type { InvitationStatus } from "./members";
import { merchantCategories } from "./merchant-categories";
import { tenants } from "./tenants";

/**
 * Merchants (spec §8.4) and the merchant authority axis.
 *
 * A `merchant` is a tenant-scoped directory record. `merchant_members` links
 * `auth.users` to a merchant — the third authority axis (alongside tenant
 * membership and platform admin): a member manages only *their* merchant's
 * listings. `merchant_invitations` is the claim-by-email flow, mirroring
 * `tenant_invitations` (only a SHA-256 hash of the token is stored).
 *
 * Cross-schema FKs to `auth.users` and the `lower(slug)` partial unique index are
 * hand-written (Drizzle can't express them); see the 0007 migration.
 */
export const merchants = pgTable(
  "merchants",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    registrationNumber: text("registration_number"),
    description: text("description"),
    categoryId: uuid("category_id").references(() => merchantCategories.id, {
      onDelete: "set null",
    }),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    website: text("website"),
    logoFileId: uuid("logo_file_id").references(() => files.id, { onDelete: "set null" }),
    coverFileId: uuid("cover_file_id").references(() => files.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active").$type<MerchantStatus>(),
    createdBy: uuid("created_by"),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("merchants_tenant_idx").on(table.tenantId)],
);

export type MerchantMemberStatus = "invited" | "active" | "removed";

export const merchantMembers = pgTable(
  "merchant_members",
  {
    id: primaryId(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    userId: uuid("user_id").notNull(),
    status: text("status").notNull().default("active").$type<MerchantMemberStatus>(),
    invitedBy: uuid("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("merchant_members_merchant_user_uq").on(table.merchantId, table.userId),
    index("merchant_members_user_idx").on(table.userId),
    index("merchant_members_merchant_idx").on(table.merchantId),
  ],
);

export const merchantInvitations = pgTable(
  "merchant_invitations",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("pending").$type<InvitationStatus>(),
    invitedBy: uuid("invited_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id"),
    ...timestamps,
  },
  (table) => [
    unique("merchant_invitations_token_hash_uq").on(table.tokenHash),
    index("merchant_invitations_tenant_idx").on(table.tenantId),
    index("merchant_invitations_merchant_idx").on(table.merchantId),
    index("merchant_invitations_email_idx").on(table.email),
  ],
);

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type MerchantMember = typeof merchantMembers.$inferSelect;
export type MerchantInvitation = typeof merchantInvitations.$inferSelect;
export type NewMerchantInvitation = typeof merchantInvitations.$inferInsert;
