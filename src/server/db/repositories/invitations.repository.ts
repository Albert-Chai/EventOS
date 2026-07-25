import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  tenantInvitations,
  tenants,
  type NewTenantInvitation,
  type TenantInvitation,
} from "@/server/db/schema";

/**
 * Tenant invitations. Tenant-scoped writes take a `tenantId` derived from
 * `ctx.tenant.id`; `findByTokenHash` is deliberately NOT tenant-scoped because
 * the invitee is not yet a member of anything — the token itself is the
 * authorization, and it is looked up by its hash, never by a client-supplied id.
 */

export async function insertInvitation(input: NewTenantInvitation): Promise<TenantInvitation> {
  const [invitation] = await db
    .insert(tenantInvitations)
    .values({ ...input, email: input.email.toLowerCase() })
    .returning();
  return invitation;
}

export async function listInvitationsForTenant(tenantId: string): Promise<TenantInvitation[]> {
  return db
    .select()
    .from(tenantInvitations)
    .where(eq(tenantInvitations.tenantId, tenantId))
    .orderBy(desc(tenantInvitations.createdAt));
}

export type InvitationWithTenant = {
  invitation: TenantInvitation;
  tenantName: string;
  /** Computed against the database clock, so the caller never touches Date.now. */
  expired: boolean;
};

export async function findInvitationByTokenHash(
  tokenHash: string,
): Promise<InvitationWithTenant | null> {
  const [row] = await db
    .select({
      invitation: tenantInvitations,
      tenantName: tenants.name,
      expired: sql<boolean>`${tenantInvitations.expiresAt} < now()`,
    })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(eq(tenantInvitations.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function findPendingInvitation(
  tenantId: string,
  email: string,
): Promise<TenantInvitation | null> {
  const [invitation] = await db
    .select()
    .from(tenantInvitations)
    .where(
      and(
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.email, email.toLowerCase()),
        eq(tenantInvitations.status, "pending"),
      ),
    )
    .limit(1);
  return invitation ?? null;
}

export async function markInvitationAccepted(
  invitationId: string,
  acceptedUserId: string,
): Promise<void> {
  await db
    .update(tenantInvitations)
    .set({ status: "accepted", acceptedUserId, acceptedAt: new Date() })
    .where(eq(tenantInvitations.id, invitationId));
}

export async function revokeInvitation(tenantId: string, invitationId: string): Promise<boolean> {
  const rows = await db
    .update(tenantInvitations)
    .set({ status: "revoked" })
    .where(
      and(
        eq(tenantInvitations.id, invitationId),
        eq(tenantInvitations.tenantId, tenantId),
        eq(tenantInvitations.status, "pending"),
      ),
    )
    .returning({ id: tenantInvitations.id });
  return rows.length > 0;
}
