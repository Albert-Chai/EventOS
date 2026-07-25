/**
 * Booth and assignment state (spec §8.6), modelled as a pure module so the
 * rules can be unit-tested without a database (CLAUDE §7.5) — the same shape as
 * the event and participation status machines.
 *
 * Two linked lifecycles:
 *
 * - a **booth** owns a physical slot on the floor plan and moves through
 *   `available → reserved → assigned → confirmed`, plus the organizer's manual
 *   `blocked`/`cancelled`;
 * - a **booth_assignment** links a booth to a merchant's participation and moves
 *   `assigned → confirmed`, or → `cancelled`.
 *
 * The service keeps the two in step: creating an assignment drives the booth to
 * `assigned`, the merchant confirming drives it to `confirmed`, cancelling
 * returns it to `available`.
 */

// --- Booth status ----------------------------------------------------------

export const BOOTH_STATUSES = [
  "available",
  "reserved",
  "assigned",
  "confirmed",
  "blocked",
  "cancelled",
] as const;

export type BoothStatus = (typeof BOOTH_STATUSES)[number];

const BOOTH_STATUS_SET = new Set<BoothStatus>(BOOTH_STATUSES);

export function isBoothStatus(value: string): value is BoothStatus {
  return BOOTH_STATUS_SET.has(value as BoothStatus);
}

export const BOOTH_STATUS_LABELS: Record<BoothStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  assigned: "Assigned",
  confirmed: "Confirmed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

/**
 * Fill colors for the map/legend, keyed by status. Tuned for legibility over a
 * floor image (assigned/confirmed read as "taken", available as "open").
 */
export const BOOTH_STATUS_COLORS: Record<BoothStatus, string> = {
  available: "#16a34a",
  reserved: "#ca8a04",
  assigned: "#2563eb",
  confirmed: "#4f46e5",
  blocked: "#6b7280",
  cancelled: "#9ca3af",
};

/** A booth can take a new assignment only when it is open. */
export function isAssignableBoothStatus(status: BoothStatus): boolean {
  return status === "available" || status === "reserved";
}

/**
 * The statuses an organizer may set directly (i.e. without going through an
 * assignment). `assigned`/`confirmed` are only ever reached via the assignment
 * flow, so they are excluded here.
 */
export const ORGANIZER_SETTABLE_BOOTH_STATUSES = [
  "available",
  "reserved",
  "blocked",
  "cancelled",
] as const satisfies readonly BoothStatus[];

export function isOrganizerSettableBoothStatus(status: BoothStatus): boolean {
  return (ORGANIZER_SETTABLE_BOOTH_STATUSES as readonly BoothStatus[]).includes(status);
}

// --- Assignment status -----------------------------------------------------

export const ASSIGNMENT_STATUSES = ["assigned", "confirmed", "cancelled"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

const ASSIGNMENT_STATUS_SET = new Set<AssignmentStatus>(ASSIGNMENT_STATUSES);

export function isAssignmentStatus(value: string): value is AssignmentStatus {
  return ASSIGNMENT_STATUS_SET.has(value as AssignmentStatus);
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: "Awaiting merchant confirmation",
  confirmed: "Confirmed by merchant",
  cancelled: "Cancelled",
};

/** An assignment counts against booth/participation uniqueness until cancelled. */
export function isActiveAssignment(status: AssignmentStatus): boolean {
  return status !== "cancelled";
}

const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, readonly AssignmentStatus[]> = {
  assigned: ["confirmed", "cancelled"],
  confirmed: ["cancelled"],
  cancelled: [],
};

export function canTransitionAssignment(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return from !== to && ASSIGNMENT_TRANSITIONS[from].includes(to);
}

/** The booth status implied by an assignment reaching `status`. */
export function boothStatusForAssignment(status: AssignmentStatus): BoothStatus {
  switch (status) {
    case "assigned":
      return "assigned";
    case "confirmed":
      return "confirmed";
    case "cancelled":
      return "available";
  }
}
