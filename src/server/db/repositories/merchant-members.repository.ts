import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  merchantInvitations,
  merchantMembers,
  merchants,
  profiles,
  type MerchantInvitation,
  type MerchantMember,
} from "@/server/db/schema";

/**
 * Merchant membership and the claim-by-email invitation flow.
 *
 * `createMerchantMember` is the join that grants a user portal access to a
 * merchant. The invitation lookup is by token hash and tenant-free (the token is
 * the authorization, exactly like tenant invitations); every other read is scoped
 * by `tenant_id` (organizer) or `merchant_id`.
 */

export async function createMerchantMember(input: {
  merchantId: string;
  tenantId: string;
  userId: string;
  invitedBy?: string | null;
  status?: "active" | "invited";
}): Promise<MerchantMember> {
  const [member] = await db
    .insert(merchantMembers)
    .values({
      merchantId: input.merchantId,
      tenantId: input.tenantId,
      userId: input.userId,
      status: input.status ?? "active",
      invitedBy: input.invitedBy ?? null,
      joinedAt: (input.status ?? "active") === "active" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [merchantMembers.merchantId, merchantMembers.userId],
      set: { status: input.status ?? "active", joinedAt: new Date() },
    })
    .returning();
  return member;
}

export type MerchantMemberListItem = {
  memberId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  joinedAt: Date | null;
};

export async function listMembersOfMerchant(
  tenantId: string,
  merchantId: string,
): Promise<MerchantMemberListItem[]> {
  return db
    .select({
      memberId: merchantMembers.id,
      userId: merchantMembers.userId,
      email: profiles.email,
      displayName: profiles.displayName,
      status: merchantMembers.status,
      joinedAt: merchantMembers.joinedAt,
    })
    .from(merchantMembers)
    .leftJoin(profiles, eq(profiles.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.tenantId, tenantId)))
    .orderBy(asc(merchantMembers.createdAt));
}

// --- Invitations -----------------------------------------------------------

export async function insertMerchantInvitation(input: {
  tenantId: string;
  merchantId: string;
  email: string;
  tokenHash: string;
  invitedBy?: string | null;
  expiresAt: Date;
}): Promise<MerchantInvitation> {
  const [invitation] = await db
    .insert(merchantInvitations)
    .values({
      tenantId: input.tenantId,
      merchantId: input.merchantId,
      email: input.email.toLowerCase(),
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy ?? null,
      expiresAt: input.expiresAt,
    })
    .returning();
  return invitation;
}

export type MerchantInvitationLookup = {
  invitation: MerchantInvitation;
  merchant: { id: string; name: string; slug: string; tenantId: string };
  expired: boolean;
};

/** Token-hash lookup — tenant-free, because the token itself is the authorization. */
export async function findMerchantInvitationByTokenHash(
  tokenHash: string,
): Promise<MerchantInvitationLookup | null> {
  const [row] = await db
    .select({
      invitation: merchantInvitations,
      merchantId: merchants.id,
      merchantName: merchants.name,
      merchantSlug: merchants.slug,
      merchantTenantId: merchants.tenantId,
      expired: sql<boolean>`${merchantInvitations.expiresAt} < now()`,
    })
    .from(merchantInvitations)
    .innerJoin(merchants, eq(merchants.id, merchantInvitations.merchantId))
    .where(eq(merchantInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  return {
    invitation: row.invitation,
    merchant: {
      id: row.merchantId,
      name: row.merchantName,
      slug: row.merchantSlug,
      tenantId: row.merchantTenantId,
    },
    expired: row.expired,
  };
}

export async function findPendingMerchantInvitation(
  merchantId: string,
  email: string,
): Promise<MerchantInvitation | null> {
  const [row] = await db
    .select()
    .from(merchantInvitations)
    .where(
      and(
        eq(merchantInvitations.merchantId, merchantId),
        eq(sql`lower(${merchantInvitations.email})`, email.toLowerCase()),
        eq(merchantInvitations.status, "pending"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markMerchantInvitationAccepted(id: string, userId: string): Promise<void> {
  await db
    .update(merchantInvitations)
    .set({ status: "accepted", acceptedAt: new Date(), acceptedUserId: userId })
    .where(eq(merchantInvitations.id, id));
}

export async function revokeMerchantInvitation(tenantId: string, id: string): Promise<boolean> {
  const [row] = await db
    .update(merchantInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(merchantInvitations.id, id),
        eq(merchantInvitations.tenantId, tenantId),
        eq(merchantInvitations.status, "pending"),
      ),
    )
    .returning({ id: merchantInvitations.id });
  return Boolean(row);
}

export async function listMerchantInvitations(
  tenantId: string,
  merchantId: string,
): Promise<MerchantInvitation[]> {
  return db
    .select()
    .from(merchantInvitations)
    .where(
      and(
        eq(merchantInvitations.tenantId, tenantId),
        eq(merchantInvitations.merchantId, merchantId),
      ),
    )
    .orderBy(desc(merchantInvitations.createdAt));
}
