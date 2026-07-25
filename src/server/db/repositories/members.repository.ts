import { and, asc, count, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import {
  profiles,
  tenantMemberRoles,
  tenantMembers,
  tenants,
  type TenantMember,
} from "@/server/db/schema";
import type { RoleKey } from "@/server/authz/roles";

/**
 * Tenant membership and role assignment.
 *
 * Two shapes of query live here and must not be confused:
 *
 *  - **User-scoped** (`listMembershipsForUser`, `findMembershipWithRoles`) resolve
 *    what a given user may do. They are how `ctx` is built, so they key on
 *    `user_id` and are the one place a tenant id is *produced* rather than
 *    required as input.
 *  - **Tenant-scoped** (`listMembersOfTenant`, mutations) take an explicit
 *    `tenantId` that the caller has already derived from `ctx.tenant.id` via the
 *    policy layer — never from client input.
 */

export type MembershipRow = {
  memberId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  memberStatus: string;
  tenantStatus: string;
};

/** Active memberships for a user, oldest first (drives the default active tenant). */
export async function listMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  return db
    .select({
      memberId: tenantMembers.id,
      tenantId: tenantMembers.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      memberStatus: tenantMembers.status,
      tenantStatus: tenants.status,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, "active")))
    .orderBy(asc(tenantMembers.createdAt));
}

export type MembershipWithRoles = {
  member: TenantMember;
  roleKeys: RoleKey[];
};

/** A user's membership in one tenant, with role keys — used to build `ctx.permissions`. */
export async function findMembershipWithRoles(
  userId: string,
  tenantId: string,
): Promise<MembershipWithRoles | null> {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.tenantId, tenantId)))
    .limit(1);

  if (!member || member.status !== "active") return null;

  const roleRows = await db
    .select({ roleKey: tenantMemberRoles.roleKey })
    .from(tenantMemberRoles)
    .where(eq(tenantMemberRoles.tenantMemberId, member.id));

  return { member, roleKeys: roleRows.map((r) => r.roleKey as RoleKey) };
}

export type TenantMemberListItem = {
  memberId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string;
  roleKeys: string[];
  joinedAt: Date | null;
};

/** All members of a tenant with their roles. `tenantId` comes from `ctx.tenant.id`. */
export async function listMembersOfTenant(tenantId: string): Promise<TenantMemberListItem[]> {
  const rows = await db
    .select({
      memberId: tenantMembers.id,
      userId: tenantMembers.userId,
      email: profiles.email,
      displayName: profiles.displayName,
      status: tenantMembers.status,
      joinedAt: tenantMembers.joinedAt,
    })
    .from(tenantMembers)
    .leftJoin(profiles, eq(profiles.id, tenantMembers.userId))
    .where(eq(tenantMembers.tenantId, tenantId))
    .orderBy(asc(tenantMembers.createdAt));

  if (rows.length === 0) return [];

  const memberIds = rows.map((r) => r.memberId);
  const roleRows = await db
    .select({ memberId: tenantMemberRoles.tenantMemberId, roleKey: tenantMemberRoles.roleKey })
    .from(tenantMemberRoles)
    .where(inArray(tenantMemberRoles.tenantMemberId, memberIds));

  const rolesByMember = new Map<string, string[]>();
  for (const r of roleRows) {
    (rolesByMember.get(r.memberId) ?? rolesByMember.set(r.memberId, []).get(r.memberId)!).push(
      r.roleKey,
    );
  }

  return rows.map((r) => ({ ...r, roleKeys: rolesByMember.get(r.memberId) ?? [] }));
}

export async function getMemberRoleKeys(memberId: string): Promise<string[]> {
  const rows = await db
    .select({ roleKey: tenantMemberRoles.roleKey })
    .from(tenantMemberRoles)
    .where(eq(tenantMemberRoles.tenantMemberId, memberId));
  return rows.map((r) => r.roleKey);
}

export async function findMemberById(
  tenantId: string,
  memberId: string,
): Promise<TenantMember | null> {
  const [member] = await db
    .select()
    .from(tenantMembers)
    .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)))
    .limit(1);
  return member ?? null;
}

/**
 * Creates a member with roles in one transaction (or returns the existing one).
 * Used by tenant creation (owner) and invitation acceptance.
 */
export async function createMemberWithRoles(input: {
  tenantId: string;
  userId: string;
  roleKeys: RoleKey[];
  invitedBy?: string | null;
  status?: "active" | "invited";
}): Promise<TenantMember> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .insert(tenantMembers)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        status: input.status ?? "active",
        invitedBy: input.invitedBy ?? null,
        joinedAt: (input.status ?? "active") === "active" ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [tenantMembers.tenantId, tenantMembers.userId],
        set: { status: input.status ?? "active", joinedAt: new Date() },
      })
      .returning();

    if (input.roleKeys.length > 0) {
      await tx
        .insert(tenantMemberRoles)
        .values(input.roleKeys.map((roleKey) => ({ tenantMemberId: member.id, roleKey })))
        .onConflictDoNothing();
    }

    return member;
  });
}

export async function setMemberRoles(memberId: string, roleKeys: RoleKey[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(tenantMemberRoles).where(eq(tenantMemberRoles.tenantMemberId, memberId));
    if (roleKeys.length > 0) {
      await tx
        .insert(tenantMemberRoles)
        .values(roleKeys.map((roleKey) => ({ tenantMemberId: memberId, roleKey })));
    }
  });
}

export async function updateMemberStatus(
  tenantId: string,
  memberId: string,
  status: "active" | "suspended" | "removed",
): Promise<TenantMember | null> {
  const [member] = await db
    .update(tenantMembers)
    .set({ status })
    .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)))
    .returning();
  return member ?? null;
}

/** Count of active owners — used to refuse removing the last owner. */
export async function countActiveOwners(tenantId: string): Promise<number> {
  const rows = await db
    .select({ memberId: tenantMembers.id })
    .from(tenantMembers)
    .innerJoin(tenantMemberRoles, eq(tenantMemberRoles.tenantMemberId, tenantMembers.id))
    .where(
      and(
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.status, "active"),
        eq(tenantMemberRoles.roleKey, "owner"),
      ),
    );
  return rows.length;
}

/** Count of active members in a tenant — the `team_members` plan limit (§22). */
export async function countMembersForTenant(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.status, "active")));
  return row?.value ?? 0;
}
