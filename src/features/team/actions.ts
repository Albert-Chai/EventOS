"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { env } from "@/config/env";
import { AppError, isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import {
  changeMemberRoles,
  inviteMember,
  removeMember,
} from "@/server/services/membership.service";
import { revokeInvitation } from "@/server/db/repositories/invitations.repository";
import { AUDIT_ACTIONS, recordAudit } from "@/server/services/audit.service";

import type { TeamActionState } from "./state";

/**
 * Team management actions. Every one is gated by `tenant.manage_members` inside
 * the service call path via `requirePermission` — the UI hiding the controls is
 * never the access control (spec §14).
 *
 * Phase 1 has no transactional email (that's Phase 3), so `inviteMemberAction`
 * returns the invitation link for the admin to share by hand rather than
 * pretending to have sent it.
 */

async function appOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : env.NEXT_PUBLIC_APP_URL;
}

export async function inviteMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const roleKeys = formData.getAll("roleKeys").map((r) => r.toString());

  try {
    const ctx = await requirePermission("tenant.manage_members");
    const { token } = await inviteMember(ctx, { email, roleKeys });

    revalidatePath("/dashboard/team");
    const url = `${await appOrigin()}/invitations/${token}`;
    return {
      status: "success",
      message: `Invitation created for ${email}. Share this link — it expires in 7 days.`,
      inviteUrl: url,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const invitationId = formData.get("invitationId")?.toString() ?? "";
  const ctx = await requirePermission("tenant.manage_members");

  const revoked = await revokeInvitation(ctx.tenant.id, invitationId);
  if (revoked) {
    await recordAudit(ctx, {
      action: AUDIT_ACTIONS.INVITATION_REVOKED,
      resourceType: "invitation",
      resourceId: invitationId,
    });
  }
  revalidatePath("/dashboard/team");
}

export async function changeRolesAction(formData: FormData): Promise<void> {
  const memberId = formData.get("memberId")?.toString() ?? "";
  const roleKeys = formData.getAll("roleKeys").map((r) => r.toString());

  const ctx = await requirePermission("tenant.manage_members");
  await changeMemberRoles(ctx, memberId, roleKeys);
  revalidatePath("/dashboard/team");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const memberId = formData.get("memberId")?.toString() ?? "";
  const ctx = await requirePermission("tenant.manage_members");
  await removeMember(ctx, memberId);
  revalidatePath("/dashboard/team");
}

function errorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof AppError) return error.message;
  return "Something went wrong. Please try again.";
}
