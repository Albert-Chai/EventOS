import { AppError } from "@/lib/api/errors";
import { isUuid } from "@/lib/uuid";
import type { AdBooking, Sponsor } from "@/server/db/schema";
import type { TenantScopedContext } from "@/server/context";
import {
  countActiveBookingsForEvent,
  findBookingById,
  findServableBookingById,
  insertBooking,
  listBookingsForEvent,
  listLiveBookingsForSlot,
  type BookingWithSponsor,
  type ServableAd,
  updateBooking,
} from "@/server/db/repositories/ad-bookings.repository";
import {
  findSponsorById,
  insertSponsor,
  listSponsors,
  updateSponsor,
} from "@/server/db/repositories/sponsors.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { captureRequestSignals, recordAnalyticsEvent } from "./analytics.service";
import { getOrSetAnonymousId } from "./visitor-identity.service";
import { publicFileUrl } from "./media.service";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { requirePlanFeature } from "./usage.service";
import {
  type AdBookingStatus,
  type AdSlot,
  isAdSlot,
  isBookingLive,
  isValidClickUrl,
  pickWeighted,
} from "@/server/ads/slots";

/**
 * Sponsor ad spaces (docs/phase-9-sponsor-ads-plan.md).
 *
 * Selling and scheduling is organiser authority (`sponsor.manage`) gated by the
 * `sponsor_module` plan entitlement. Serving is a public read that filters by
 * servability, and both tracking writes derive their attribution from the
 * booking's **own row** — never from the request (§1/§6 public-write seam).
 */

// --- serving ----------------------------------------------------------------

export type ServedAd = {
  bookingId: string;
  sponsorName: string;
  imageUrl: string | null;
  altText: string;
  /** Always our own redirect, never the sponsor's URL rendered raw. */
  href: string | null;
};

/**
 * Pick one ad to show in `slot` for a public event.
 *
 * Weighted rotation across every live booking, so several sponsors can share a
 * slot. Returns null when nothing is booked — every call site renders nothing
 * rather than a placeholder. `random` is injectable so the behaviour is testable.
 */
export async function selectAdForSlot(
  eventId: string,
  slot: AdSlot,
  opts: { now?: Date; random?: () => number } = {},
): Promise<ServedAd | null> {
  const now = opts.now ?? new Date();
  const live = await listLiveBookingsForSlot(eventId, slot, now);
  // A booking with no creative has nothing to render — drop it before the draw
  // so it can't win the slot and blank it.
  const renderable = live.filter((b): b is ServableAd => Boolean(b.creativeBucket && b.creativePath));
  const chosen = pickWeighted(renderable, (opts.random ?? Math.random)());
  if (!chosen) return null;

  return {
    bookingId: chosen.id,
    sponsorName: chosen.sponsorName,
    imageUrl:
      chosen.creativeBucket && chosen.creativePath
        ? publicFileUrl({ bucket: chosen.creativeBucket, path: chosen.creativePath })
        : null,
    altText: chosen.altText?.trim() || `Advertisement from ${chosen.sponsorName}`,
    href: chosen.clickUrl ? `/s/${chosen.id}` : null,
  };
}

/**
 * Record that a served ad was rendered.
 *
 * Attribution comes from the booking row (tenant, event, sponsor, slot), so a
 * caller can only name a booking id — it can never assert which tenant or event
 * the impression belongs to. This is the same seam `/q` uses for QR scans.
 *
 * Known limit (documented in the plan): a scripted client can replay this to
 * inflate impressions, exactly as it can replay `event_viewed`. Clicks are the
 * harder-to-forge number, and no money moves on either while billing is simulated.
 */
export async function recordAdImpression(bookingId: string): Promise<void> {
  const booking = await findServableBookingById(bookingId, new Date());
  if (!booking) return; // unknown, paused, or out of flight — attribute nothing

  const [anonymousId, signals] = await Promise.all([getOrSetAnonymousId(), captureRequestSignals()]);
  await recordAnalyticsEvent({
    tenantId: booking.tenantId,
    eventId: booking.eventId,
    name: "ad_impression",
    anonymousId,
    props: { bookingId: booking.id, sponsorId: booking.sponsorId, slot: booking.slot },
    ...signals,
  });
}

/**
 * Record a click and hand back where to send the visitor.
 *
 * The destination is read from our database, never from the query string, so
 * `/s/[id]` is not an open redirect. Returns null when the booking isn't
 * servable, and the route 404s rather than explaining why.
 */
export async function resolveAdClick(bookingId: string): Promise<string | null> {
  // Shape-check before the id becomes a `uuid` comparison. `/s/<junk>` is a
  // public URL on every sponsor banner, and a mistyped or truncated one should
  // 404 like any other unknown booking rather than 500 (see lib/uuid.ts).
  if (!isUuid(bookingId)) return null;

  const booking = await findServableBookingById(bookingId, new Date());
  if (!booking?.clickUrl || !isValidClickUrl(booking.clickUrl)) return null;

  const [anonymousId, signals] = await Promise.all([getOrSetAnonymousId(), captureRequestSignals()]);
  await recordAnalyticsEvent({
    tenantId: booking.tenantId,
    eventId: booking.eventId,
    name: "ad_click",
    anonymousId,
    props: { bookingId: booking.id, sponsorId: booking.sponsorId, slot: booking.slot },
    ...signals,
  });
  return booking.clickUrl;
}

/** Public wrapper used by the visitor pages: resolve the event, then serve. */
export async function selectAdForPublicSlot(
  tenantSlug: string,
  eventSlug: string,
  slot: AdSlot,
): Promise<ServedAd | null> {
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return null;
  return selectAdForSlot(event.id, slot);
}

// --- organiser: sponsors ----------------------------------------------------

export async function createSponsor(
  ctx: TenantScopedContext,
  input: { name: string; websiteUrl?: string | null; contactEmail?: string | null; notes?: string | null },
): Promise<Sponsor> {
  await requirePlanFeature(ctx.tenant.id, "sponsor_module");

  const name = input.name.trim();
  if (name.length < 2) {
    throw new AppError("VALIDATION_ERROR", { message: "Sponsor name is too short." });
  }
  if (input.websiteUrl && !isValidClickUrl(input.websiteUrl)) {
    throw new AppError("VALIDATION_ERROR", { message: "Website must be a http(s) URL." });
  }

  const sponsor = await insertSponsor({
    tenantId: ctx.tenant.id,
    name,
    websiteUrl: input.websiteUrl?.trim() || null,
    contactEmail: input.contactEmail?.trim().toLowerCase() || null,
    notes: input.notes?.trim() || null,
    status: "active",
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.SPONSOR_CREATED,
    resourceType: "sponsor",
    resourceId: sponsor.id,
    after: { name: sponsor.name },
  });
  return sponsor;
}

export async function listSponsorsForTenant(ctx: TenantScopedContext): Promise<Sponsor[]> {
  return listSponsors(ctx.tenant.id);
}

export async function archiveSponsor(ctx: TenantScopedContext, sponsorId: string): Promise<void> {
  const existing = await findSponsorById(ctx.tenant.id, sponsorId);
  if (!existing) throw new AppError("NOT_FOUND", { message: "Sponsor not found." });

  await updateSponsor(ctx.tenant.id, sponsorId, { status: "archived" });
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.SPONSOR_ARCHIVED,
    resourceType: "sponsor",
    resourceId: sponsorId,
    before: { status: existing.status },
    after: { status: "archived" },
  });
}

// --- organiser: bookings ----------------------------------------------------

export async function createBooking(
  ctx: TenantScopedContext,
  input: {
    eventId: string;
    sponsorId: string;
    slot: string;
    clickUrl?: string | null;
    altText?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    weight?: number;
  },
): Promise<AdBooking> {
  await requirePlanFeature(ctx.tenant.id, "sponsor_module");

  if (!isAdSlot(input.slot)) {
    throw new AppError("VALIDATION_ERROR", { message: "Unknown ad slot." });
  }
  const sponsor = await findSponsorById(ctx.tenant.id, input.sponsorId);
  if (!sponsor) throw new AppError("NOT_FOUND", { message: "Sponsor not found." });

  if (input.clickUrl && !isValidClickUrl(input.clickUrl)) {
    throw new AppError("VALIDATION_ERROR", { message: "Click-through must be a http(s) URL." });
  }
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt) {
    throw new AppError("VALIDATION_ERROR", { message: "The end date is before the start date." });
  }
  const weight = input.weight && input.weight > 0 ? Math.floor(input.weight) : 1;

  const booking = await insertBooking({
    tenantId: ctx.tenant.id,
    eventId: input.eventId,
    sponsorId: input.sponsorId,
    slot: input.slot,
    clickUrl: input.clickUrl?.trim() || null,
    altText: input.altText?.trim() || null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    weight,
    // Starts as a draft: it can't serve until a creative is attached and the
    // organiser activates it.
    status: "draft",
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.AD_BOOKING_CREATED,
    resourceType: "ad_booking",
    resourceId: booking.id,
    after: { sponsor: sponsor.name, slot: booking.slot },
  });
  return booking;
}

export async function setBookingStatus(
  ctx: TenantScopedContext,
  bookingId: string,
  status: AdBookingStatus,
): Promise<void> {
  const existing = await findBookingById(ctx.tenant.id, bookingId);
  if (!existing) throw new AppError("NOT_FOUND", { message: "Booking not found." });

  // Activating a booking with no creative would serve a blank slot.
  if (status === "active" && !existing.creativeFileId) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Upload a creative before activating this booking.",
    });
  }

  await updateBooking(ctx.tenant.id, bookingId, { status });
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.AD_BOOKING_UPDATED,
    resourceType: "ad_booking",
    resourceId: bookingId,
    before: { status: existing.status },
    after: { status },
  });
}

export async function listBookingsForEventScoped(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<BookingWithSponsor[]> {
  return listBookingsForEvent(ctx.tenant.id, eventId);
}

export async function countActiveBookings(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<number> {
  return countActiveBookingsForEvent(ctx.tenant.id, eventId);
}

/** Re-exported so the dashboard can label a booking without duplicating the rule. */
export { isBookingLive };
