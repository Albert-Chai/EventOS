import type { Permission } from "@/server/authz/permissions";

/**
 * Merchant onboarding state (spec §8.4), modelled as a pure module so the
 * approval workflow can be unit-tested without a database (CLAUDE §7.5).
 *
 * The lifecycle lives on `merchant_event_participations` — a merchant's listing
 * *for one event* — not on the merchant record itself. The merchant record has a
 * much simpler `active | suspended` state (an organizer disabling a bad actor).
 */

// --- Participation approval lifecycle -------------------------------------

export const PARTICIPATION_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

const PARTICIPATION_STATUS_SET = new Set<ParticipationStatus>(PARTICIPATION_STATUSES);

export function isParticipationStatus(value: string): value is ParticipationStatus {
  return PARTICIPATION_STATUS_SET.has(value as ParticipationStatus);
}

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/**
 * Legal transitions. The merchant drives the left side (prepare → submit →
 * withdraw); the organizer drives the review verdicts (approve / request changes
 * / reject). A rejected listing is terminal; a withdrawn one can be revived.
 */
const TRANSITIONS: Record<ParticipationStatus, readonly ParticipationStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["approved", "changes_requested", "rejected", "withdrawn"],
  changes_requested: ["submitted", "draft", "withdrawn"],
  approved: ["withdrawn"],
  rejected: [],
  withdrawn: ["draft"],
};

export function allowedParticipationTransitions(
  from: ParticipationStatus,
): readonly ParticipationStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionParticipation(
  from: ParticipationStatus,
  to: ParticipationStatus,
): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

/** Which side of the table performs a given transition. */
export type ParticipationActor = "merchant" | "organizer";

export function actorForParticipationTransition(to: ParticipationStatus): ParticipationActor {
  // The three review verdicts belong to the organizer; everything else (prepare,
  // submit, withdraw, revive) is the merchant's own.
  if (to === "approved" || to === "changes_requested" || to === "rejected") return "organizer";
  return "merchant";
}

/** The permission an organizer review verdict requires. */
export function permissionForReview(to: ParticipationStatus): Permission {
  if (to === "approved") return "merchant.approve";
  // changes_requested and rejected are both "not approved" verdicts.
  return "merchant.reject";
}

/** A participation is publicly visible only once approved (event visibility still applies). */
export function isPublicParticipation(status: ParticipationStatus): boolean {
  return status === "approved";
}

// --- Merchant record status -----------------------------------------------

export const MERCHANT_STATUSES = ["active", "suspended"] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];

// --- Listing item availability --------------------------------------------

export const ITEM_AVAILABILITIES = ["available", "sold_out", "hidden"] as const;
export type ItemAvailability = (typeof ITEM_AVAILABILITIES)[number];

export const ITEM_AVAILABILITY_LABELS: Record<ItemAvailability, string> = {
  available: "Available",
  sold_out: "Sold out",
  hidden: "Hidden",
};
