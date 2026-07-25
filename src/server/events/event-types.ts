/**
 * Event type and visibility vocabularies (spec §8.3).
 *
 * Like statuses, these are `text` columns with a documented TS union rather than
 * Postgres enums — the sets grow, and widening a union is cheaper than altering
 * an enum type in place (see `schema/_shared.ts`).
 *
 * Naming stays generic (spec §8.5): the same row is a stall at a night market
 * and a booth at a property expo. The `event_type` only tweaks default copy and
 * iconography in the UI, never the data model.
 */

export const EVENT_TYPES = [
  "food_festival",
  "night_market",
  "expo",
  "fair",
  "market",
  "conference",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<EventType>(EVENT_TYPES);

export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value as EventType);
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  food_festival: "Food festival",
  night_market: "Night market",
  expo: "Expo",
  fair: "Fair",
  market: "Market",
  conference: "Conference",
  other: "Other",
};

/**
 * Visibility (spec §8.3), independent of status:
 *  - `public`   — reachable by URL and eligible for the tenant's public index.
 *  - `unlisted` — reachable by URL, but never listed (share-by-link only).
 *  - `private`  — reachable only inside the organizer dashboard; a 404 publicly.
 *
 * A row is only ever public at all when its *status* is also public
 * (see `isPublicStatus`) — visibility narrows, it does not grant.
 */
export const EVENT_VISIBILITIES = ["public", "unlisted", "private"] as const;

export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

const EVENT_VISIBILITY_SET = new Set<EventVisibility>(EVENT_VISIBILITIES);

export function isEventVisibility(value: string): value is EventVisibility {
  return EVENT_VISIBILITY_SET.has(value as EventVisibility);
}

/** Reachable by a direct public URL (public or unlisted), status permitting. */
export function isPubliclyReachable(visibility: EventVisibility): boolean {
  return visibility !== "private";
}

/** Eligible to appear in the tenant's public event index. */
export function isPubliclyListable(visibility: EventVisibility): boolean {
  return visibility === "public";
}
