/**
 * Sponsor ad slots and booking status (spec §8.x sponsors, docs/phase-9-sponsor-ads-plan.md).
 *
 * Like permissions, audit actions and the analytics taxonomy, these are **code,
 * not data**: closed, additive unions the schema types itself against. A slot
 * name is a contract with the rendered surface — additive only, never renamed
 * once a booking references it.
 */

export const AD_SLOTS = [
  "event_landing",
  "directory_inline",
  "merchant_detail",
  "floor_plan",
  "vouchers",
] as const;

export type AdSlot = (typeof AD_SLOTS)[number];

const AD_SLOT_SET = new Set<string>(AD_SLOTS);

export function isAdSlot(value: string): value is AdSlot {
  return AD_SLOT_SET.has(value);
}

export const AD_SLOT_LABELS: Record<AdSlot, string> = {
  event_landing: "Event landing",
  directory_inline: "Stall directory",
  merchant_detail: "Stall page",
  floor_plan: "Floor plan",
  vouchers: "Vouchers",
};

/** Where each slot renders, shown to the organiser when booking. */
export const AD_SLOT_DESCRIPTIONS: Record<AdSlot, string> = {
  event_landing: "Under the hero on the event home — the highest-traffic slot.",
  directory_inline: "Between stall cards in the directory listing.",
  merchant_detail: "Below the menu on an individual stall page.",
  floor_plan: "Inside the floor plan's bottom sheet.",
  vouchers: "Above the voucher list.",
};

export const AD_BOOKING_STATUSES = ["draft", "active", "paused", "archived"] as const;

export type AdBookingStatus = (typeof AD_BOOKING_STATUSES)[number];

const AD_STATUS_SET = new Set<string>(AD_BOOKING_STATUSES);

export function isAdBookingStatus(value: string): value is AdBookingStatus {
  return AD_STATUS_SET.has(value);
}

export const AD_BOOKING_STATUS_LABELS: Record<AdBookingStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const SPONSOR_STATUSES = ["active", "archived"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

/** The shape liveness depends on — kept minimal so the pure test is trivial. */
export type BookingWindow = {
  status: AdBookingStatus;
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * Is this booking eligible to be served right now?
 *
 * `active` **and** inside its flight window. A null bound is open-ended on that
 * side, so a booking with no dates runs for as long as it stays active. Pure and
 * unit-tested; the SQL in `ad-bookings.repository.ts` mirrors it (the same
 * `pure ↔ SQL` split as `eventPhase ↔ phaseExpr`).
 */
export function isBookingLive(booking: BookingWindow, now: Date): boolean {
  if (booking.status !== "active") return false;
  if (booking.startsAt && booking.startsAt.getTime() > now.getTime()) return false;
  if (booking.endsAt && booking.endsAt.getTime() < now.getTime()) return false;
  return true;
}

/**
 * Weighted choice from a `[0, 1)` random.
 *
 * Split out from the service so a test can pin `r` and assert exactly which
 * booking wins, rather than sampling a distribution. A non-positive weight is
 * floored to 1 so a mis-entered 0 still gets served rather than silently
 * disappearing. Returns null only for an empty list.
 */
export function pickWeighted<T extends { weight: number }>(items: readonly T[], r: number): T | null {
  if (items.length === 0) return null;
  const weights = items.map((i) => (Number.isFinite(i.weight) && i.weight > 0 ? i.weight : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  // Clamp so a caller passing exactly 1 (or a float artefact) can't fall through.
  let threshold = Math.min(Math.max(r, 0), 0.999_999_999) * total;
  for (let i = 0; i < items.length; i += 1) {
    threshold -= weights[i];
    if (threshold < 0) return items[i];
  }
  return items[items.length - 1];
}

/** A click-through URL must be a plain http(s) link — validated before storage. */
export function isValidClickUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
