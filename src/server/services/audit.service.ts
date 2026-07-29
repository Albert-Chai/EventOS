import { headers } from "next/headers";

import { insertAuditLog, insertAuditLogs } from "@/server/db/repositories/audit.repository";
import type { AuthenticatedContext } from "@/server/context";
import { logger } from "@/server/telemetry/logger";

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
  ZONE_CREATED: "zone.created",
  ZONE_UPDATED: "zone.updated",
  ZONE_DELETED: "zone.deleted",
  MAP_FLOOR_CREATED: "map.floor_created",
  MAP_FLOOR_UPDATED: "map.floor_updated",
  MAP_FLOOR_DELETED: "map.floor_deleted",
  BOOTH_CREATED: "booth.created",
  BOOTH_UPDATED: "booth.updated",
  BOOTH_DELETED: "booth.deleted",
  BOOTH_STATUS_CHANGED: "booth.status_changed",
  BOOTH_ASSIGNED: "booth.assigned",
  BOOTH_ASSIGNMENT_CONFIRMED: "booth.assignment_confirmed",
  BOOTH_UNASSIGNED: "booth.unassigned",
  FILE_UPLOADED: "file.uploaded",
  FILE_REMOVED: "file.removed",
  BILLING_PLAN_CHANGED: "billing.plan_changed",
  MERCHANT_FEATURED: "merchant.featured",
  MERCHANT_UNFEATURED: "merchant.unfeatured",
  QR_CODE_CREATED: "qr.code_created",
  QR_CODE_UPDATED: "qr.code_updated",
  VOUCHER_CREATED: "voucher.created",
  VOUCHER_UPDATED: "voucher.updated",
  VOUCHER_STATUS_CHANGED: "voucher.status_changed",
  VOUCHER_REDEEMED: "voucher.redeemed",
  SPONSOR_CREATED: "sponsor.created",
  SPONSOR_ARCHIVED: "sponsor.archived",
  AD_BOOKING_CREATED: "ad_booking.created",
  AD_BOOKING_UPDATED: "ad_booking.updated",
  CAMPAIGN_CREATED: "campaign.created",
  CAMPAIGN_UPDATED: "campaign.updated",
  CAMPAIGN_SCHEDULED: "campaign.scheduled",
  CAMPAIGN_SENT: "campaign.sent",
  MOMENT_HIDDEN: "moment.hidden",
  MOMENT_RESTORED: "moment.restored",
  MOMENT_COMMENT_HIDDEN: "moment.comment_hidden",
  MOMENT_COMMENT_RESTORED: "moment.comment_restored",
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

export type SystemAuditEntry = {
  action: AuditAction;
  /** The affected row's own tenant, read from the row — never a client value. */
  tenantId: string | null;
  resourceType?: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Writes audit lines for a **system** action — a scheduled job with no
 * authenticated user (spec §23 still applies to state changes it makes). The
 * actor is `null` (the trail's `actor_user_id` is nullable, as for platform-level
 * lines) and there are no request headers. Best-effort and batched: a failed
 * audit insert is logged, never surfaced, and never rolls back the transition
 * that already committed — the same trade-off as `recordAudit`.
 */
export async function recordSystemAudits(entries: SystemAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await insertAuditLogs(
      entries.map((e) => ({
        actorUserId: null,
        tenantId: e.tenantId,
        action: e.action,
        resourceType: e.resourceType ?? null,
        resourceId: e.resourceId ?? null,
        beforeJson: e.before ?? null,
        afterJson: e.after ?? null,
        viaImpersonation: false,
        ipAddress: null,
        userAgent: "system/scheduler",
      })),
    );
  } catch (error) {
    logger.error("audit.system_write_failed", { count: entries.length, error });
  }
}
