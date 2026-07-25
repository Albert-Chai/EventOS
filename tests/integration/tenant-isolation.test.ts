import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { permissionsForRoles } from "@/server/authz/roles";
import { generateToken, hashToken } from "@/server/authz/tokens";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import {
  findInvitationByTokenHash,
  findPendingInvitation,
  insertInvitation,
  markInvitationAccepted,
  revokeInvitation,
} from "@/server/db/repositories/invitations.repository";
import {
  createMemberWithRoles,
  findMembershipWithRoles,
  listMembersOfTenant,
  listMembershipsForUser,
} from "@/server/db/repositories/members.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";

/**
 * The Phase 1 exit criterion: **a member of one tenant cannot reach another's
 * data through the repository layer** (spec §5, §34). Runs against the real
 * database using the seeded users; skips when no database is configured.
 *
 * Uses the seeded auth users (a `tenant_members.user_id` FK requires real
 * users) and cleans up the tenants it creates — the cascade removes the
 * memberships and roles with them.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("tenant isolation (integration)", () => {
  const createdTenantIds: string[] = [];
  let userA = "";
  let userB = "";
  let tenantA = "";
  let tenantB = "";
  const stamp = String(Date.now()).slice(-9);

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      findProfileByEmail("organizer.owner@eventos.test"),
      findProfileByEmail("organizer.staff@eventos.test"),
    ]);
    if (!a || !b) throw new Error("Seed users missing — run `pnpm db:seed` first.");
    userA = a.id;
    userB = b.id;

    const ta = await insertTenant({
      name: "Isolation A",
      slug: `iso-a-${stamp}`,
      createdBy: userA,
    });
    const tb = await insertTenant({
      name: "Isolation B",
      slug: `iso-b-${stamp}`,
      createdBy: userB,
    });
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    await createMemberWithRoles({ tenantId: tenantA, userId: userA, roleKeys: ["owner"] });
    await createMemberWithRoles({ tenantId: tenantB, userId: userB, roleKeys: ["event_manager"] });
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("lists only the caller's own memberships", async () => {
    const forA = await listMembershipsForUser(userA);
    const tenantIdsForA = forA.map((m) => m.tenantId);
    expect(tenantIdsForA).toContain(tenantA);
    expect(tenantIdsForA).not.toContain(tenantB);
  });

  it("returns null for a tenant the user does not belong to", async () => {
    // The isolation boundary: user A asking about tenant B gets nothing, so
    // `ctx.tenant` can never be resolved to B for user A.
    expect(await findMembershipWithRoles(userA, tenantB)).toBeNull();
    expect(await findMembershipWithRoles(userB, tenantA)).toBeNull();
  });

  it("resolves roles and permissions only within the user's own tenant", async () => {
    const membership = await findMembershipWithRoles(userA, tenantA);
    expect(membership?.roleKeys).toEqual(["owner"]);

    const perms = permissionsForRoles(membership!.roleKeys);
    expect(perms.has("tenant.manage_members")).toBe(true);
  });

  it("does not leak members across tenants", async () => {
    const membersA = await listMembersOfTenant(tenantA);
    const membersB = await listMembersOfTenant(tenantB);

    expect(membersA.map((m) => m.userId)).toEqual([userA]);
    expect(membersB.map((m) => m.userId)).toEqual([userB]);
    expect(membersA.map((m) => m.userId)).not.toContain(userB);
  });

  it("scopes invitation lookups to their tenant, but token lookup is tenant-free", async () => {
    const { token, tokenHash } = generateToken();
    const invitation = await insertInvitation({
      tenantId: tenantA,
      email: "invitee@eventos.test",
      roleKeys: ["marketing"],
      tokenHash,
      invitedBy: userA,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    // The token is the authorization: found by hash regardless of tenant.
    const byToken = await findInvitationByTokenHash(hashToken(token));
    expect(byToken?.invitation.id).toBe(invitation.id);
    expect(byToken?.expired).toBe(false);

    // But the pending-lookup is tenant-scoped: tenant B cannot see A's invite.
    expect(await findPendingInvitation(tenantB, "invitee@eventos.test")).toBeNull();
    expect(await findPendingInvitation(tenantA, "invitee@eventos.test")).not.toBeNull();

    // Accepting flips status; revoke on an accepted invite is a no-op.
    await markInvitationAccepted(invitation.id, userB);
    expect(await revokeInvitation(tenantA, invitation.id)).toBe(false);
  });

  it("reports an expired invitation via the database clock", async () => {
    const { token, tokenHash } = generateToken();
    await insertInvitation({
      tenantId: tenantA,
      email: "late@eventos.test",
      roleKeys: ["analyst"],
      tokenHash,
      invitedBy: userA,
      expiresAt: new Date(Date.now() - 1000), // already past
    });

    const found = await findInvitationByTokenHash(hashToken(token));
    expect(found?.expired).toBe(true);
  });
});
