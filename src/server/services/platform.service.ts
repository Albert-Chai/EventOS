import { AppError } from "@/lib/api/errors";
import { findAuthUserByEmail } from "@/server/auth/admin";
import type { AuthenticatedContext } from "@/server/context";
import {
  countPlatformAdmins,
  grantPlatformAdmin,
  isPlatformAdmin,
  revokePlatformAdmin,
} from "@/server/db/repositories/platform-admins.repository";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Platform super-admin management (spec §4.1). Callers gated by
 * `requirePlatformAdmin`.
 */

export async function grantAdminByEmail(
  ctx: AuthenticatedContext,
  email: string,
  note?: string,
): Promise<{ userId: string }> {
  const user = await findAuthUserByEmail(email);
  if (!user) {
    throw new AppError("NOT_FOUND", {
      message: "No account exists for that email. They must sign up first.",
    });
  }

  await grantPlatformAdmin({ userId: user.id, grantedBy: ctx.user.id, note });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.PLATFORM_ADMIN_GRANTED,
    resourceType: "platform_admin",
    resourceId: user.id,
    after: { email, note: note ?? null },
    tenantId: null,
  });

  ctx.log.info("platform_admin.granted", { targetUserId: user.id });
  return { userId: user.id };
}

export async function revokeAdmin(ctx: AuthenticatedContext, userId: string): Promise<void> {
  if (!(await isPlatformAdmin(userId))) {
    throw new AppError("NOT_FOUND", { message: "That user is not a platform admin." });
  }

  // Never leave the platform with no admins, and don't let an admin revoke the
  // last remaining seat (themselves included).
  if ((await countPlatformAdmins()) <= 1) {
    throw new AppError("CONFLICT", { message: "Cannot revoke the last platform administrator." });
  }

  await revokePlatformAdmin(userId);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.PLATFORM_ADMIN_REVOKED,
    resourceType: "platform_admin",
    resourceId: userId,
    tenantId: null,
  });

  ctx.log.info("platform_admin.revoked", { targetUserId: userId });
}
