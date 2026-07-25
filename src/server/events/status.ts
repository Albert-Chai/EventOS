import type { Permission } from "@/server/authz/permissions";

/**
 * Event lifecycle (spec §8.3) — the full nine-status machine, as a pure module
 * so the transition rules can be unit-tested without a database (CLAUDE §7.5:
 * status transitions are critical business logic and must be tested).
 *
 * The persisted `status` is authoritative. `live`/`ended` are reached by an
 * explicit action for now; a scheduler to advance them by date is deferred with
 * the rest of the job-runner work (see docs/phase-2-plan.md §7). The public site
 * still shows the right label because it derives a *phase* from the dates
 * (`eventPhase`), independent of exactly when the status was flipped.
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
