/**
 * Analytics event taxonomy (spec §25) and QR target types (§8.10).
 *
 * Like permissions and audit actions, event names are **code, not data**: a
 * closed, additive union so dashboards and the aggregation job can rely on stable
 * strings. The full §25 set is defined now for a stable contract; Phase 7 only
 * *emits* a subset — later phases emit the rest (vouchers, reviews, booth/item),
 * exactly as the permission list was defined ahead of its enforcement.
 *
 * Names are a contract: additive only, never renamed once shipped.
 */
export const ANALYTICS_EVENTS = [
  "page_viewed",
  "event_viewed",
  "merchant_list_viewed",
  "merchant_viewed",
  "merchant_searched",
  "search_performed",
  "filter_applied",
  "map_opened",
  "booth_selected",
  "merchant_favourited",
  "merchant_unfavourited",
  "item_viewed",
  "qr_scanned",
  "voucher_viewed",
  "voucher_claimed",
  "voucher_redeemed",
  "review_submitted",
  "share_clicked",
  "visitor_registered",
  "pwa_installed",
  "notification_opened",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<AnalyticsEventName>(ANALYTICS_EVENTS);

export function isAnalyticsEvent(value: string): value is AnalyticsEventName {
  return EVENT_SET.has(value as AnalyticsEventName);
}

/**
 * The subset a public browser beacon (`<Track>`) is allowed to send. Favourite
 * and QR-scan events only ever originate server-side (inside `setFavourite` and
 * the `/q` redirect), so the beacon can never forge them — an attacker replaying
 * the public action can still only inflate view-type counts, never fabricate a
 * favourite or a scan.
 */
export const CLIENT_TRACKABLE = [
  "event_viewed",
  "merchant_list_viewed",
  "merchant_viewed",
  "search_performed",
  "filter_applied",
  "map_opened",
  "share_clicked",
  "pwa_installed",
] as const satisfies readonly AnalyticsEventName[];

export type ClientTrackableEvent = (typeof CLIENT_TRACKABLE)[number];

const CLIENT_SET = new Set<string>(CLIENT_TRACKABLE);

export function isClientTrackable(value: string): value is ClientTrackableEvent {
  return CLIENT_SET.has(value);
}

/**
 * Derived rollup keys the daily aggregation adds beyond a raw count of each event
 * name. Stored in `daily_*_metrics.metric` alongside the raw names.
 */
export const ROLLUP_METRICS = {
  /** Distinct `anonymous_id` seen that day. */
  UNIQUE_VISITORS: "unique_visitors",
  /** Total events of any name that day. */
  TOTAL_EVENTS: "total_events",
} as const;

/**
 * QR target kinds (spec §8.10). Phase 7 generates `event` + `merchant` codes; the
 * rest are defined for the stable redirect contract and land as their surfaces do.
 */
export const QR_TARGET_TYPES = [
  "event",
  "merchant",
  "booth",
  "item",
  "voucher",
  "passport_checkpoint",
  "staff_verification",
  "visitor_registration",
  "url",
] as const;

export type QrTargetType = (typeof QR_TARGET_TYPES)[number];

const QR_TARGET_SET = new Set<string>(QR_TARGET_TYPES);

export function isQrTargetType(value: string): value is QrTargetType {
  return QR_TARGET_SET.has(value);
}
