import QRCode from "qrcode";

import { env } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { generateShortCode } from "@/lib/short-code";
import {
  findActiveQrCodeForTarget,
  findQrCodeByShortCode,
  incrementQrScanCount,
  insertQrCode,
} from "@/server/db/repositories/qr-codes.repository";
import { insertQrScanEvent } from "@/server/db/repositories/qr-scan-events.repository";
import type { AuthenticatedContext, MerchantScopedContext, TenantScopedContext } from "@/server/context";
import type { QrCode } from "@/server/db/schema";
import type { QrTargetType } from "@/server/analytics/taxonomy";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { recordAnalyticsEvent, type RequestSignals } from "./analytics.service";

/**
 * Trackable QR codes (spec §8.10). Every code resolves through `/q/{short_code}`,
 * so its destination stays retargetable and every scan is logged. Codes are
 * generated **idempotently** per target (one active code per target, enforced by
 * a partial unique index), audited on first creation, and rendered to a
 * self-contained PNG data URI for display.
 */

export type QrCodeView = {
  id: string;
  shortCode: string;
  url: string;
  targetPath: string;
  scanCount: number;
};

/** The absolute, scannable URL a code encodes. */
export function qrUrl(shortCode: string): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/q/${shortCode}`;
}

function toView(code: QrCode): QrCodeView {
  return {
    id: code.id,
    shortCode: code.shortCode,
    url: qrUrl(code.shortCode),
    targetPath: code.targetPath,
    scanCount: code.scanCount,
  };
}

/** Renders any text (here, a `/q/...` URL) to a PNG data URI — no external asset. */
export async function renderQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: "M" });
}

type QrTargetInput = {
  tenantId: string;
  targetType: QrTargetType;
  targetId: string;
  targetPath: string;
  eventId?: string | null;
  merchantId?: string | null;
  participationId?: string | null;
  label?: string;
};

/** Idempotent get-or-create for one target. Audits `qr.code_created` on first creation. */
async function getOrCreateQrCode(ctx: AuthenticatedContext, input: QrTargetInput): Promise<QrCodeView> {
  const existing = await findActiveQrCodeForTarget(input.tenantId, input.targetType, input.targetId);
  if (existing) return toView(existing);

  try {
    const code = await insertQrCode({
      tenantId: input.tenantId,
      eventId: input.eventId ?? null,
      merchantId: input.merchantId ?? null,
      participationId: input.participationId ?? null,
      shortCode: generateShortCode(),
      targetType: input.targetType,
      targetId: input.targetId,
      targetPath: input.targetPath,
      label: input.label ?? null,
      createdBy: ctx.user.id,
    });
    await recordAudit(ctx, {
      action: AUDIT_ACTIONS.QR_CODE_CREATED,
      resourceType: "qr_code",
      resourceId: code.id,
      tenantId: input.tenantId,
      after: { targetType: input.targetType, targetId: input.targetId, shortCode: code.shortCode },
    });
    return toView(code);
  } catch (error) {
    // A concurrent request may have created the active code (partial unique index),
    // or the short code collided. Adopt the winner if there is one; otherwise fail.
    const raced = await findActiveQrCodeForTarget(input.tenantId, input.targetType, input.targetId);
    if (raced) return toView(raced);
    throw new AppError("INTERNAL_ERROR", {
      message: "Could not generate a QR code.",
      cause: error,
    });
  }
}

/** The event-homepage code for an organizer's event. */
export async function getOrCreateEventQrCode(
  ctx: TenantScopedContext,
  event: { id: string; slug: string },
): Promise<QrCodeView> {
  return getOrCreateQrCode(ctx, {
    tenantId: ctx.tenant.id,
    targetType: "event",
    targetId: event.id,
    targetPath: `/${ctx.tenant.slug}/${event.slug}`,
    eventId: event.id,
    label: "Event homepage",
  });
}

/**
 * The listing code for one of a merchant's participations (a merchant-in-event).
 * `targetId` is the participation id — a merchant in several events gets a
 * distinct code per listing. Slugs are server-resolved by the caller, never
 * client values.
 */
export async function getOrCreateMerchantQrCode(
  ctx: MerchantScopedContext,
  target: { eventId: string; eventSlug: string; tenantSlug: string; participationId: string },
): Promise<QrCodeView> {
  return getOrCreateQrCode(ctx, {
    tenantId: ctx.merchant.tenantId,
    targetType: "merchant",
    targetId: target.participationId,
    targetPath: `/${target.tenantSlug}/${target.eventSlug}/${ctx.merchant.slug}`,
    eventId: target.eventId,
    merchantId: ctx.merchant.id,
    participationId: target.participationId,
    label: "Merchant listing",
  });
}

/**
 * Resolves a scanned short code and logs the scan. Returns the destination path,
 * or null if the code is unknown, disabled, or expired (the redirect then falls
 * back to the app root). The scan's `tenant_id` comes from the code's own row —
 * server-derived, never the client. Also mirrors an `analytics_events`
 * `qr_scanned` row so the dashboards' scan counts match.
 */
export async function resolveScan(input: {
  shortCode: string;
  anonymousId: string | null;
  visitorId?: string | null;
  signals: RequestSignals;
  country: string | null;
  now: Date;
}): Promise<{ targetPath: string } | null> {
  const code = await findQrCodeByShortCode(input.shortCode);
  if (!code || !code.isActive) return null;
  if (code.expiresAt && code.expiresAt.getTime() < input.now.getTime()) return null;

  await Promise.all([
    insertQrScanEvent({
      tenantId: code.tenantId,
      qrCodeId: code.id,
      shortCode: code.shortCode,
      targetType: code.targetType,
      targetId: code.targetId,
      eventId: code.eventId,
      merchantId: code.merchantId,
      visitorId: input.visitorId ?? null,
      anonymousId: input.anonymousId,
      deviceType: input.signals.deviceType,
      browser: input.signals.browser,
      referrer: input.signals.referrer,
      country: input.country,
    }),
    incrementQrScanCount(code.id),
    recordAnalyticsEvent({
      tenantId: code.tenantId,
      eventId: code.eventId,
      merchantId: code.merchantId,
      participationId: code.participationId,
      anonymousId: input.anonymousId,
      visitorId: input.visitorId ?? null,
      name: "qr_scanned",
      deviceType: input.signals.deviceType,
      browser: input.signals.browser,
      referrer: input.signals.referrer,
      source: input.signals.source,
      props: { shortCode: code.shortCode, targetType: code.targetType },
    }),
  ]);

  return { targetPath: code.targetPath };
}
