import type { Permission } from "@/server/authz/permissions";

/**
 * Event lifecycle (spec §8.3) — the full nine-status machine, as a pure module
 * so the transition rules can be unit-tested without a database (CLAUDE §7.5:
 * status transitions are critical business logic and must be tested).
 *
 * The persisted `status` is authoritative. `live`/`ended` are reached either by
 * an explicit organizer action or by the status scheduler advancing them by date
 * (`dueEventStatus` below; see docs/background-jobs.md). The public site also
 * derives a *phase* from the dates (`eventPhase`) independent of the stored
 * status, so the label is right even between scheduler runs.
 */

export const EVENT_STATUSES = [
  "draft",
  "setup",
  "merchant_onboarding",
  "ready_for_review",
  "published",
  "live",
  "ended",
  "archived",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

const EVENT_STATUS_SET = new Set<EventStatus>(EVENT_STATUSES);

export function isEventStatus(value: string): value is EventStatus {
  return EVENT_STATUS_SET.has(value as EventStatus);
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  setup: "Setup",
  merchant_onboarding: "Merchant onboarding",
  ready_for_review: "Ready for review",
  published: "Published",
  live: "Live",
  ended: "Ended",
  archived: "Archived",
  cancelled: "Cancelled",
};

/**
 * Allowed forward (and a few deliberate backward) transitions.
 *
 * - The setup chain may be walked forwards, and stepped back one stage so a
 *   mistake is fixable.
 * - A `draft` may jump straight to `published` (small events skip setup).
 * - `published` may return to `draft` (unpublish).
 * - `cancelled` is reachable from any non-terminal status.
 * - `archived` is the terminal resting state for anything already run or cancelled.
 */
const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["setup", "published", "cancelled"],
  setup: ["draft", "merchant_onboarding", "published", "cancelled"],
  merchant_onboarding: ["setup", "ready_for_review", "cancelled"],
  ready_for_review: ["merchant_onboarding", "published", "cancelled"],
  published: ["draft", "live", "ended", "archived", "cancelled"],
  live: ["ended", "archived", "cancelled"],
  ended: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

export function allowedTransitions(from: EventStatus): readonly EventStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

/**
 * The permission a transition into `to` requires. Publishing and going live gate
 * on `event.publish`; archiving on `event.archive`; every other move (editing
 * through setup, unpublishing, ending, cancelling) on `event.update`. A role
 * with only `event.view` (e.g. merchant_manager, support) can move nothing.
 */
export function permissionForTransition(to: EventStatus): Permission {
  if (to === "published" || to === "live") return "event.publish";
  if (to === "archived") return "event.archive";
  return "event.update";
}

/** Statuses whose events are eligible to be seen publicly (visibility permitting). */
export function isPublicStatus(status: EventStatus): boolean {
  return status === "published" || status === "live" || status === "ended";
}

export const PUBLIC_STATUSES: readonly EventStatus[] = EVENT_STATUSES.filter(isPublicStatus);

/**
 * Display phase for a publicly-visible event, derived from the dates rather than
 * the stored status — so a visitor sees "Live" during the event window even
 * before an organizer (or the future scheduler) flips the status. `now` is
 * passed in to keep this pure and testable.
 */
export type EventPhase = "upcoming" | "live" | "ended";

export function eventPhase(status: EventStatus, startAt: Date, endAt: Date, now: Date): EventPhase {
  if (status === "ended") return "ended";
  if (now < startAt) return "upcoming";
  if (now > endAt) return "ended";
  return "live";
}

export const EVENT_PHASE_LABELS: Record<EventPhase, string> = {
  upcoming: "Upcoming",
  live: "Live now",
  ended: "Ended",
};

/**
 * The status the scheduler should advance an event to given the clock, or `null`
 * to leave it alone (spec §34 job runner; see `docs/background-jobs.md`). Pure so
 * it can be unit-tested without a database; the SQL sweep in
 * `scheduler.repository.ts` mirrors it exactly (like `eventPhase` ↔ `phaseExpr`).
 *
 * End is checked before start so a `published` event already past its end date
 * ends rather than briefly going live. Every returned target is a legal move in
 * the transition machine above. `null` dates mean open-ended on that side.
 */
export function dueEventStatus(
  event: { status: EventStatus; startAt: Date | null; endAt: Date | null },
  now: Date,
): "live" | "ended" | null {
  const { status, startAt, endAt } = event;
  if ((status === "published" || status === "live") && endAt && now >= endAt) {
    return "ended";
  }
  if (status === "published" && startAt && now >= startAt) {
    return "live";
  }
  return null;
}
