/**
 * Campaign lifecycle, channels, audiences and delivery states (spec §8.12,
 * §34 Phase 8). Pure, so the transition rules and report maths are unit-testable.
 *
 * Delivery in Phase 8 is **simulated** — a send records a `notification_deliveries`
 * row per recipient without contacting a provider (see `docs/phase-8-plan.md` §2).
 * These unions are the contract a real provider adapter will fill in later, so
 * they model the states a real send needs (`bounced`, `opened`, `clicked`), not
 * just the ones the simulation produces.
 */

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "paused",
  "cancelled",
  "failed",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

const CAMPAIGN_STATUS_SET = new Set<CampaignStatus>(CAMPAIGN_STATUSES);

export function isCampaignStatus(value: string): value is CampaignStatus {
  return CAMPAIGN_STATUS_SET.has(value as CampaignStatus);
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  paused: "Paused",
  cancelled: "Cancelled",
  failed: "Failed",
};

/**
 * Allowed transitions.
 *
 * - `draft` → `scheduled` (pick a time) or straight to `sending` (send now).
 * - `sending` is the in-flight state; it settles into `sent` or `failed`.
 * - `sent`, `cancelled` are terminal: a campaign is never re-sent, because its
 *   deliveries are already recorded against its recipients. Duplicate a campaign
 *   to send again.
 * - `failed` may be retried back into `sending`.
 */
const TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["scheduled", "sending", "cancelled"],
  scheduled: ["draft", "sending", "paused", "cancelled"],
  paused: ["scheduled", "draft", "cancelled"],
  sending: ["sent", "failed"],
  failed: ["sending", "cancelled"],
  sent: [],
  cancelled: [],
};

export function allowedCampaignTransitions(from: CampaignStatus): readonly CampaignStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

// --- Channels and audiences -------------------------------------------------

/** SMS and WhatsApp are deferred (§8.12 lists them as paid/future add-ons). */
export const CAMPAIGN_CHANNELS = ["email", "push", "in_app"] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  email: "Email",
  push: "Web push",
  in_app: "In-app",
};

export function isCampaignChannel(value: string): value is CampaignChannel {
  return (CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

export const AUDIENCE_TYPES = [
  "all_visitors",
  "favourited_merchant",
  "claimed_voucher",
  "recent_visitors",
] as const;

export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all_visitors: "Everyone who visited this event",
  favourited_merchant: "Visitors who favourited a merchant",
  claimed_voucher: "Visitors who claimed a voucher",
  recent_visitors: "Visitors active in the last 7 days",
};

export function isAudienceType(value: string): value is AudienceType {
  return (AUDIENCE_TYPES as readonly string[]).includes(value);
}

/** The usage metric a channel's sends bill against (spec §22). */
export function usageMetricForChannel(channel: CampaignChannel): "email_sends" | "push_sends" | null {
  if (channel === "email") return "email_sends";
  if (channel === "push") return "push_sends";
  return null; // in-app costs nothing to deliver
}

// --- Deliveries and reporting -----------------------------------------------

export const DELIVERY_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "opened",
  "clicked",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Statuses that mean the message reached the recipient (for the delivery rate). */
const REACHED: readonly DeliveryStatus[] = ["sent", "delivered", "opened", "clicked"];

export type CampaignReport = {
  recipients: number;
  reached: number;
  failed: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
};

/**
 * Rolls delivery-status counts into the report the dashboard renders. Rates are
 * 0 when there is nothing to divide by — never NaN in the UI.
 */
export function summariseDeliveries(counts: Record<string, number>): CampaignReport {
  const get = (s: DeliveryStatus) => counts[s] ?? 0;
  const recipients = DELIVERY_STATUSES.reduce((sum, s) => sum + get(s), 0);
  const reached = REACHED.reduce((sum, s) => sum + get(s), 0);
  const failed = get("failed") + get("bounced");
  const opened = get("opened") + get("clicked");
  const clicked = get("clicked");
  const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    recipients,
    reached,
    failed,
    opened,
    clicked,
    deliveryRate: rate(reached, recipients),
    openRate: rate(opened, reached),
    clickRate: rate(clicked, reached),
  };
}
