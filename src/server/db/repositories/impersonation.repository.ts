import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import {
  impersonationSessions,
  tenants,
  type ImpersonationSession,
  type NewImpersonationSession,
} from "@/server/db/schema";

/**
 * Impersonation sessions (spec §4.1). The session lives here, not in the cookie,
 * so it can be expired and revoked server-side.
 */

export async function insertImpersonationSession(
  input: NewImpersonationSession,
): Promise<ImpersonationSession> {
  const [session] = await db.insert(impersonationSessions).values(input).returning();
  return session;
}

export type ActiveImpersonation = {
  session: ImpersonationSession;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
};

/**
 * Resolves an impersonation session id from the cookie to a *live* session:
 * not ended, not expired. Crucially also requires `actor_user_id` to match the
 * currently authenticated user, so a leaked cookie cannot be replayed by
 * anyone else.
 */
export async function findLiveImpersonation(
  sessionId: string,
  actorUserId: string,
  now: Date,
): Promise<ActiveImpersonation | null> {
  const [row] = await db
    .select({
      session: impersonationSessions,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantStatus: tenants.status,
    })
    .from(impersonationSessions)
    .innerJoin(tenants, eq(tenants.id, impersonationSessions.tenantId))
    .where(
      and(
        eq(impersonationSessions.id, sessionId),
        eq(impersonationSessions.actorUserId, actorUserId),
        isNull(impersonationSessions.endedAt),
        gt(impersonationSessions.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function endImpersonationSession(
  sessionId: string,
  actorUserId: string,
): Promise<ImpersonationSession | null> {
  const [session] = await db
    .update(impersonationSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(impersonationSessions.id, sessionId),
        eq(impersonationSessions.actorUserId, actorUserId),
        isNull(impersonationSessions.endedAt),
      ),
    )
    .returning();
  return session ?? null;
}
