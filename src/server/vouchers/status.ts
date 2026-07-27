import type { Permission } from "@/server/authz/permissions";

/**
 * Voucher lifecycle and claim rules (spec §34 Phase 8, §8.8), as a pure module so
 * the transition rules, claimability predicate, and discount maths can be
 * unit-tested without a database (CLAUDE §7.5).
 *
 * `isClaimable` is the single source of truth shared by the public list, the
 * claim service, and the redeem path — a voucher must never look claimable in the
 * UI but be rejected by the service, or vice versa.
 */

export const VOUCHER_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "expired",
  "archived",
] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

const VOUCHER_STATUS_SET = new Set<VoucherStatus>(VOUCHER_STATUSES);

export function isVoucherStatus(value: string): value is VoucherStatus {
  return VOUCHER_STATUS_SET.has(value as VoucherStatus);
}

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  archived: "Archived",
};

/**
 * Allowed transitions.
 *
 * - `draft` is the editing state; it can be scheduled or activated directly.
 * - `scheduled` waits for its start date; it can be activated or pulled back.
 * - `active` ⇄ `paused` is the live on/off switch an organizer uses mid-event.
 * - `expired` is reached from active/paused/scheduled (by date or by hand) and is
 *   terminal apart from archiving — a claimed code outlives its voucher, so we
 *   never delete, only archive.
 */
const TRANSITIONS: Record<VoucherStatus, readonly VoucherStatus[]> = {
  draft: ["scheduled", "active", "archived"],
  scheduled: ["draft", "active", "expired", "archived"],
  active: ["paused", "expired", "archived"],
  paused: ["active", "expired", "archived"],
  expired: ["archived"],
  archived: [],
};

export function allowedVoucherTransitions(from: VoucherStatus): readonly VoucherStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionVoucher(from: VoucherStatus, to: VoucherStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

/** Every voucher move is a management action; there is no separate publish grant. */
export function permissionForVoucherTransition(): Permission {
  return "voucher.manage";
}

// --- Types and codes --------------------------------------------------------

export const VOUCHER_TYPES = [
  "discount_percent",
  "discount_amount",
  "freebie",
  "bogo",
  "bundle",
] as const;

export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  discount_percent: "Percentage discount",
  discount_amount: "Amount discount",
  freebie: "Free item",
  bogo: "Buy one get one",
  bundle: "Bundle deal",
};

export function isVoucherType(value: string): value is VoucherType {
  return (VOUCHER_TYPES as readonly string[]).includes(value);
}

/** A claimed code's own lifecycle, independent of the voucher's. */
export const VOUCHER_CODE_STATUSES = ["issued", "redeemed", "void", "expired"] as const;

export type VoucherCodeStatus = (typeof VOUCHER_CODE_STATUSES)[number];

export const CLAIM_STATUSES = ["active", "redeemed", "expired", "cancelled"] as const;

export type VoucherClaimStatus = (typeof CLAIM_STATUSES)[number];

// --- Claimability -----------------------------------------------------------

/** The subset of a voucher row the claim rules need — keeps this module pure. */
export type ClaimableVoucher = {
  status: VoucherStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  totalQuantity: number | null;
  claimedCount: number;
};

export type ClaimableReason =
  | "ok"
  | "not_active"
  | "not_started"
  | "ended"
  | "sold_out";

/**
 * Why a voucher can (or cannot) be claimed right now. `now` is a parameter so
 * this stays pure and testable. A null `total_quantity` means unlimited; a null
 * date means open-ended on that side.
 */
export function claimableReason(voucher: ClaimableVoucher, now: Date): ClaimableReason {
  if (voucher.status !== "active") return "not_active";
  if (voucher.startsAt && now < voucher.startsAt) return "not_started";
  if (voucher.endsAt && now >= voucher.endsAt) return "ended";
  if (voucher.totalQuantity !== null && voucher.claimedCount >= voucher.totalQuantity) {
    return "sold_out";
  }
  return "ok";
}

export function isClaimable(voucher: ClaimableVoucher, now: Date): boolean {
  return claimableReason(voucher, now) === "ok";
}

/** Remaining claims, or null when unlimited. */
export function remainingQuantity(voucher: ClaimableVoucher): number | null {
  if (voucher.totalQuantity === null) return null;
  return Math.max(voucher.totalQuantity - voucher.claimedCount, 0);
}

// --- Presentation maths -----------------------------------------------------

export type DiscountShape = {
  voucherType: VoucherType;
  discountPercent: number | null;
  discountAmountCents: number | null;
  currency: string;
};

/**
 * The human label for a voucher's value ("20% off", "RM5 off"). Kept next to the
 * type union so a new voucher type can't be added without deciding how it reads.
 */
export function describeDiscount(voucher: DiscountShape): string {
  switch (voucher.voucherType) {
    case "discount_percent":
      return voucher.discountPercent ? `${voucher.discountPercent}% off` : "Discount";
    case "discount_amount": {
      if (!voucher.discountAmountCents) return "Discount";
      const amount = (voucher.discountAmountCents / 100).toFixed(2).replace(/\.00$/, "");
      return `${voucher.currency} ${amount} off`;
    }
    case "freebie":
      return "Free item";
    case "bogo":
      return "Buy 1 free 1";
    case "bundle":
      return "Bundle deal";
  }
}
