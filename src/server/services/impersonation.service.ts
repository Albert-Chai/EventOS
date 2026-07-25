import { headers } from "next/headers";

import { AppError } from "@/lib/api/errors";
import type { AuthenticatedContext } from "@/server/context";
import {
  endImpersonationSession,
  insertImpersonationSession,
} from "@/server/db/repositories/impersonation.repository";
import { findTenantById } from "@/server/db/repositories/tenants.repository";
import { clearImpersonationCookie, setImpersonationCookie } from "@/server/session/cookies";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Support impersonation (spec §4.1, §20, §23). Callers gated by
 * `requirePlatformAdmin`.
 *
 * The session is time-boxed and server-side; starting one sets a cookie holding
 * only the opaque session id. `session.ts` re-checks liveness and actor match on
 * every request, so nothing here is trusted after the fact.
 */

const IMPERSONATION_TTL_MINUTES = 30;

export async function startImpersonation(
  ctx: AuthenticatedContext,
  input: { tenantId: string; reason?: string },
): Promise<{ sessionId: string; expiresAt: Date }> {
  const tenant = await findTenantById(input.tenantId);
  if (!tenant) throw new AppError("NOT_FOUND", { message: "Tenant not found." });

  const headerList = await headers();
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60 * 1000);

  const session = await insertImpersonationSession({
    actorUserId: ctx.user.id,
    tenantId: tenant.id,
    reason: input.reason?.trim() || null,
    expiresAt,
    ipAddress:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null,
    userAgent: headerList.get("user-agent"),
  });

  await setImpersonationCookie(session.id, expiresAt);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.IMPERSONATION_STARTED,
    resourceType: "tenant",
    resourceId: tenant.id,
    after: { reason: session.reason, expiresAt: expiresAt.toISOString() },
    tenantId: tenant.id,
  });

  ctx.log.warn("impersonation.started", { tenantId: tenant.id, sessionId: session.id });
  return { sessionId: session.id, expiresAt };
}

/**
 * Ends the active impersonation. Reads the session id from context rather than
 * an argument, so a user can only ever end *their own* impersonation.
 */
export async function stopImpersonation(ctx: AuthenticatedContext): Promise<void> {
  const sessionId = ctx.impersonation?.sessionId;

  if (sessionId) {
    const ended = await endImpersonationSession(sessionId, ctx.user.id);
    if (ended) {
      await recordAudit(ctx, {
        action: AUDIT_ACTIONS.IMPERSONATION_ENDED,
        resourceType: "tenant",
        resourceId: ended.tenantId,
        tenantId: ended.tenantId,
      });
      ctx.log.warn("impersonation.ended", { sessionId });
    }
  }

  // Always clear the cookie, even if the row was already gone, so a stale cookie
  // never keeps the banner up.
  await clearImpersonationCookie();
}
