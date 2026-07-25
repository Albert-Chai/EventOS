import { headers } from "next/headers";

import { insertAuditLog } from "@/server/db/repositories/audit.repository";
import type { AuthenticatedContext } from "@/server/context";

/**
 * Audit actions (spec §23). A closed catalog so the trail is queryable and
 * dashboards can rely on stable strings. Additive only.
 */
export const AUDIT_ACTIONS = {
  TENANT_CREATED: "tenant.created",
  TENANT_UPDATED: "tenant.updated",
  TENANT_SUSPENDED: "tenant.suspended",
  MEMBER_INVITED: "member.invited",
  INVITATION_REVOKED: "member.invitation_revoked",
  MEMBER_JOINED: "member.joined",
  MEMBER_ROLES_CHANGED: "member.roles_changed",
  MEMBER_REMOVED: "member.removed",
  PLATFORM_ADMIN_GRANTED: "platform_admin.granted",
  PLATFORM_ADMIN_REVOKED: "platform_admin.revoked",
  IMPERSONATION_STARTED: "user.impersonation_started",
  IMPERSONATION_ENDED: "user.impersonation_ended",
  EVENT_CREATED: "event.created",
  EVENT_UPDATED: "event.updated",
  EVENT_STATUS_CHANGED: "event.status_changed",
  EVENT_DUPLICATED: "event.duplicated",
  EVENT_DELETED: "event.deleted",
  EVENT_SETTINGS_UPDATED: "event.settings_updated",
  EVENT_BRANDING_UPDATED: "event.branding_updated",
  EVENT_HOURS_UPDATED: "event.hours_updated",
  MERCHANT_CREATED: "merchant.created",
  MERCHANT_UPDATED: "merchant.updated",
  MERCHANT_SUSPENDED: "merchant.suspended",
  MERCHANT_INVITED: "merchant.invited",
  MERCHANT_INVITATION_REVOKED: "merchant.invitation_revoked",
  MERCHANT_MEMBER_JOINED: "merchant.member_joined",
  MERCHANT_CATEGORY_CREATED: "merchant.category_created",
  PARTICIPATION_ADDED: "participation.added",
  PARTICIPATION_STATUS_CHANGED: "participation.status_changed",
  LISTING_ITEM_CREATED: "listing_item.created",
  LISTING_ITEM_UPDATED: "listing_item.updated",
  LISTING_ITEM_DELETED: "listing_item.deleted",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

type AuditInput = {
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  /** Override the tenant scope (e.g. platform actions on a specific tenant). */
  tenantId?: string | null;
};

/**
 * Writes an audit entry from the request context.
 *
 * The actor is always `ctx.user` — the *real* authenticated user, so an action
 * taken during impersonation records the platform admin who took it, with
 * `via_impersonation` set, never the tenant's own members.
 *
 * An audit-write failure is logged but does not roll back the business action:
 * losing the audit line is bad, but silently failing the user's operation
 * because the audit insert hiccuped is worse. Failures are logged at error
 * level so they alert.
 */
export async function recordAudit(ctx: AuthenticatedContext, input: AuditInput): Promise<void> {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null;

    await insertAuditLog({
      actorUserId: ctx.user.id,
      tenantId: input.tenantId !== undefined ? input.tenantId : (ctx.tenant?.id ?? null),
      action: input.action,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      beforeJson: input.before ?? null,
      afterJson: input.after ?? null,
      viaImpersonation: Boolean(ctx.impersonation),
      ipAddress,
      userAgent: headerList.get("user-agent"),
    });
  } catch (error) {
    ctx.log.error("audit.write_failed", { action: input.action, error });
  }
}
