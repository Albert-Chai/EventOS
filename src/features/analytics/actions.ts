"use server";

import { isAppError } from "@/lib/api/errors";
import { findEventById } from "@/server/db/repositories/events.repository";
import { findMerchantListingTarget } from "@/server/db/repositories/participations.repository";
import { requireMerchantMember } from "@/server/policies/require-merchant";
import { requirePermission } from "@/server/policies/require-user";
import type { ClientTrackableEvent } from "@/server/analytics/taxonomy";
import { recordTrackedEvent } from "@/server/services/analytics.service";
import {
  getOrCreateEventQrCode,
  getOrCreateMerchantQrCode,
  renderQrDataUrl,
  type QrCodeView,
} from "@/server/services/qr.service";

import { eventQrSchema, merchantQrSchema, trackEventSchema } from "./schemas";
import type { QrPanelResult } from "./state";

/**
 * Public + authenticated analytics actions (spec §25, §8.10). The tracking beacon
 * is public and best-effort — it never throws to the visitor, and the tenant +
 * event are resolved from the URL slugs inside the service (never a client value).
 * The QR actions re-check authority (they're behind a permission / merchant
 * membership) and generate the code on demand, idempotently.
 */

/** The public beacon. Fire-and-forget from `<Track>`. */
export async function trackEventAction(input: unknown): Promise<void> {
  const parsed = trackEventSchema.safeParse(input);
  if (!parsed.success) return;
  try {
    await recordTrackedEvent({
      // `name` passed the `isClientTrackable` refinement, so the cast is sound.
      name: parsed.data.name as ClientTrackableEvent,
      tenantSlug: parsed.data.tenantSlug,
      eventSlug: parsed.data.eventSlug,
      merchantSlug: parsed.data.merchantSlug,
      props: parsed.data.props,
    });
  } catch {
    // Tracking is best-effort — never surface an error to the visitor.
  }
}

async function toPanelResult(code: QrCodeView): Promise<QrPanelResult> {
  const dataUri = await renderQrDataUrl(code.url);
  return {
    ok: true,
    shortCode: code.shortCode,
    url: code.url,
    dataUri,
    scanCount: code.scanCount,
    targetPath: code.targetPath,
  };
}

/** Generates (or fetches) the event-homepage QR for the organizer dashboard. */
export async function getEventQrAction(input: unknown): Promise<QrPanelResult> {
  const parsed = eventQrSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const ctx = await requirePermission("analytics.view");
    const event = await findEventById(ctx.tenant.id, parsed.data.eventId);
    if (!event) return { ok: false, message: "Event not found." };
    return toPanelResult(await getOrCreateEventQrCode(ctx, { id: event.id, slug: event.slug }));
  } catch (error) {
    return { ok: false, message: isAppError(error) ? error.message : "Could not load the QR code." };
  }
}

/** Generates (or fetches) a merchant listing's QR for the merchant dashboard. */
export async function getMerchantQrAction(input: unknown): Promise<QrPanelResult> {
  const parsed = merchantQrSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const ctx = await requireMerchantMember(parsed.data.merchantId);
    const target = await findMerchantListingTarget(ctx.merchant.id, parsed.data.participationId);
    if (!target) return { ok: false, message: "Listing not found." };
    return toPanelResult(
      await getOrCreateMerchantQrCode(ctx, {
        eventId: target.eventId,
        eventSlug: target.eventSlug,
        tenantSlug: target.tenantSlug,
        participationId: target.participationId,
      }),
    );
  } catch (error) {
    return { ok: false, message: isAppError(error) ? error.message : "Could not load the QR code." };
  }
}
