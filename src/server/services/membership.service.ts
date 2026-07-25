import { AppError } from "@/lib/api/errors";
import { isRoleKey, type RoleKey } from "@/server/authz/roles";
import { generateToken, hashToken } from "@/server/authz/tokens";
import type { AuthenticatedContext, TenantScopedContext } from "@/server/context";
import {
  findInvitationByTokenHash,
  findPendingInvitation,
  insertInvitation,
  markInvitationAccepted,
} from "@/server/db/repositories/invitations.repository";
import {
  countActiveOwners,
  createMemberWithRoles,
  findMemberById,
  getMemberRoleKeys,
  setMemberRoles,
  updateMemberStatus,
} from "@/server/db/repositories/members.repository";
import type { TenantInvitation } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { assertWithinLimit } from "./usage.service";

/**
 * Team membership within a tenant (spec §4.2–4.3, §23). Every mutation is
 * tenant-scoped through `ctx.tenant.id` — never a client-supplied tenant id —
 * and audited.
 */

const INVITE_TTL_DAYS = 7;

function validateRoles(roleKeys: string[]): RoleKey[] {
  const valid = roleKeys.filter(isRoleKey);
  if (valid.length === 0) {
    throw new AppError("VALIDATION_ERROR", { message: "Select at least one valid role." });
  }
  return valid;
}

export type InviteResult = { invitation: TenantInvitation; token: string };

/**
 * Creates an invitation and returns the one-time token (for the link). Requires
 * `tenant.manage_members`, enforced by the caller.
 */
export async function inviteMember(
  ctx: TenantScopedContext,
  input: { email: string; roleKeys: string[] },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError("VALIDATION_ERROR", { message: "Enter a valid email address." });
  }
  const roleKeys = validateRoles(input.roleKeys);

  if (await findPendingInvitation(ctx.tenant.id, email)) {
    throw new AppError("CONFLICT", {
      message: "There is already a pending invitation for that email.",
    });
  }

  // Plan limit: team members per tenant (§22).
  await assertWithinLimit(ctx.tenant.id, "team_members");

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await insertInvitation({
    tenantId: ctx.tenant.id,
    email,
    roleKeys,
    tokenHash,
    invitedBy: ctx.user.id,
    expiresAt,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MEMBER_INVITED,
    resourceType: "invitation",
    resourceId: invitation.id,
    after: { email, roleKeys },
  });

  ctx.log.info("member.invited", { invitationId: invitation.id });
  return { invitation, token };
}

export type AcceptInvitationResult = { tenantId: string; tenantName: string };

/**
 * Accepts an invitation by its token, for the currently authenticated user.
 *
 * Not tenant-scoped on entry — the token *is* the authorization. Validates that
 * the invitation is pending, unexpired, and (defence in depth) addressed to the
 * accepting user's email, then creates the membership and roles.
 */
export async function acceptInvitation(
  ctx: AuthenticatedContext,
  token: string,
): Promise<AcceptInvitationResult> {
  const found = await findInvitationByTokenHash(hashToken(token));
  if (!found) throw new AppError("NOT_FOUND", { message: "This invitation link is not valid." });

  const { invitation } = found;

  if (invitation.status !== "pending") {
    throw new AppError("CONFLICT", {
      message: "This invitation has already been used or revoked.",
    });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError("CONFLICT", { message: "This invitation has expired." });
  }
  if (invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
    // Accepting must be the invited person, not just anyone holding the link.
    throw new AppError("FORBIDDEN", {
      message: `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
    });
  }

  const roleKeys = validateRoles(invitation.roleKeys);

  await createMemberWithRoles({
    tenantId: invitation.tenantId,
    userId: ctx.user.id,
    roleKeys,
    invitedBy: invitation.invitedBy,
    status: "active",
  });
  await markInvitationAccepted(invitation.id, ctx.user.id);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MEMBER_JOINED,
    resourceType: "invitation",
    resourceId: invitation.id,
    after: { roleKeys },
    tenantId: invitation.tenantId,
  });

  ctx.log.info("member.joined", { tenantId: invitation.tenantId });
  return { tenantId: invitation.tenantId, tenantName: found.tenantName };
}

export async function changeMemberRoles(
  ctx: TenantScopedContext,
  memberId: string,
  roleKeys: string[],
): Promise<void> {
  const member = await findMemberById(ctx.tenant.id, memberId);
  if (!member) throw new AppError("NOT_FOUND", { message: "Member not found." });

  const valid = validateRoles(roleKeys);

  // Refuse to strip the last owner of their owner role — a tenant with no owner
  // can never manage itself again.
  if (!valid.includes("owner")) {
    const currentRoles = await getMemberRoleKeys(memberId);
    if (currentRoles.includes("owner") && (await countActiveOwners(ctx.tenant.id)) <= 1) {
      throw new AppError("CONFLICT", {
        message: "This is the only owner. Assign another owner before changing this role.",
      });
    }
  }

  await setMemberRoles(memberId, valid);
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MEMBER_ROLES_CHANGED,
    resourceType: "member",
    resourceId: memberId,
    after: { roleKeys: valid },
  });
}

export async function removeMember(ctx: TenantScopedContext, memberId: string): Promise<void> {
  const member = await findMemberById(ctx.tenant.id, memberId);
  if (!member) throw new AppError("NOT_FOUND", { message: "Member not found." });

  const memberRoles = await getMemberRoleKeys(memberId);
  if (memberRoles.includes("owner") && (await countActiveOwners(ctx.tenant.id)) <= 1) {
    throw new AppError("CONFLICT", { message: "You cannot remove the only owner." });
  }

  const updated = await updateMemberStatus(ctx.tenant.id, memberId, "removed");
  if (!updated) throw new AppError("NOT_FOUND", { message: "Member not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MEMBER_REMOVED,
    resourceType: "member",
    resourceId: memberId,
    before: { userId: member.userId, roleKeys: memberRoles },
  });
}
