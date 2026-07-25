import { and, desc, eq, lt } from "drizzle-orm";

import { db } from "@/server/db";
import { auditLogs, profiles, type AuditLog, type NewAuditLog } from "@/server/db/schema";

/**
 * Audit log (spec §23). Insert-only — the table rejects UPDATE/DELETE at the
 * database level (0003 migration), so there is deliberately no update here.
 */

export async function insertAuditLog(entry: NewAuditLog): Promise<void> {
  await db.insert(auditLogs).values(entry);
}

export type AuditLogRow = AuditLog & { actorEmail: string | null };

/**
 * Reads the audit trail. `tenantId` scopes to one tenant (for the organizer's
 * own audit view); omitting it returns the platform-wide trail and must only be
 * called behind `requirePlatformAdmin`.
 */
export async function listAuditLogs(options: {
  tenantId?: string;
  before?: Date;
  limit?: number;
}): Promise<AuditLogRow[]> {
  const conditions = [];
  if (options.tenantId) conditions.push(eq(auditLogs.tenantId, options.tenantId));
  if (options.before) conditions.push(lt(auditLogs.createdAt, options.before));

  return db
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.actorUserId,
      tenantId: auditLogs.tenantId,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      beforeJson: auditLogs.beforeJson,
      afterJson: auditLogs.afterJson,
      viaImpersonation: auditLogs.viaImpersonation,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
      actorEmail: profiles.email,
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.id, auditLogs.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(options.limit ?? 100, 500));
}
