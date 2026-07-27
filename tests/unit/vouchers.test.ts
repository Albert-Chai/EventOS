import { describe, expect, it } from "vitest";

import {
  allowedVoucherTransitions,
  canTransitionVoucher,
  claimableReason,
  describeDiscount,
  isClaimable,
  remainingQuantity,
  VOUCHER_STATUSES,
} from "@/server/vouchers/status";
import {
  canTransitionCampaign,
  summariseDeliveries,
  usageMetricForChannel,
} from "@/server/campaigns/status";

/**
 * Phase 8 pure logic (spec §34): the voucher + campaign status machines, the
 * claimability predicate every surface shares, discount labels, and the campaign
 * report maths. No database (CLAUDE §7.5 — status transitions and limits are
 * critical business logic and must be unit-tested).
 */

const base = {
  status: "active" as const,
  startsAt: null,
  endsAt: null,
  totalQuantity: null,
  claimedCount: 0,
};
const NOW = new Date("2026-07-27T12:00:00Z");

describe("voucher status machine", () => {
  it("walks draft → active → paused → active", () => {
    expect(canTransitionVoucher("draft", "active")).toBe(true);
    expect(canTransitionVoucher("active", "paused")).toBe(true);
    expect(canTransitionVoucher("paused", "active")).toBe(true);
  });

  it("refuses a no-op and an illegal jump", () => {
    expect(canTransitionVoucher("active", "active")).toBe(false);
    // A finished voucher can only be archived, never reactivated.
    expect(canTransitionVoucher("expired", "active")).toBe(false);
    expect(canTransitionVoucher("archived", "active")).toBe(false);
  });

  it("makes archived terminal", () => {
    expect(allowedVoucherTransitions("archived")).toHaveLength(0);
  });

  it("never lets a status reach itself", () => {
    for (const status of VOUCHER_STATUSES) {
      expect(allowedVoucherTransitions(status)).not.toContain(status);
    }
  });
});

describe("claimableReason", () => {
  it("accepts an open, active, unlimited voucher", () => {
    expect(claimableReason(base, NOW)).toBe("ok");
    expect(isClaimable(base, NOW)).toBe(true);
  });

  it("rejects anything not active — a draft is invisible, not an error", () => {
    for (const status of ["draft", "scheduled", "paused", "expired", "archived"] as const) {
      expect(claimableReason({ ...base, status }, NOW)).toBe("not_active");
    }
  });

  it("respects the claim window on both sides", () => {
    expect(claimableReason({ ...base, startsAt: new Date("2026-07-28T00:00:00Z") }, NOW)).toBe(
      "not_started",
    );
    expect(claimableReason({ ...base, endsAt: new Date("2026-07-26T00:00:00Z") }, NOW)).toBe("ended");
    // The end is exclusive: at exactly endsAt the voucher is over.
    expect(claimableReason({ ...base, endsAt: NOW }, NOW)).toBe("ended");
  });

  it("reports sold out only when the quantity is actually exhausted", () => {
    expect(claimableReason({ ...base, totalQuantity: 10, claimedCount: 9 }, NOW)).toBe("ok");
    expect(claimableReason({ ...base, totalQuantity: 10, claimedCount: 10 }, NOW)).toBe("sold_out");
  });

  it("treats a null quantity as unlimited", () => {
    expect(claimableReason({ ...base, claimedCount: 99999 }, NOW)).toBe("ok");
    expect(remainingQuantity(base)).toBeNull();
    expect(remainingQuantity({ ...base, totalQuantity: 10, claimedCount: 4 })).toBe(6);
    // Never negative, even if the counter somehow overshoots.
    expect(remainingQuantity({ ...base, totalQuantity: 10, claimedCount: 12 })).toBe(0);
  });
});

describe("describeDiscount", () => {
  const shape = { discountPercent: null, discountAmountCents: null, currency: "MYR" };

  it("labels a percentage", () => {
    expect(describeDiscount({ ...shape, voucherType: "discount_percent", discountPercent: 20 })).toBe(
      "20% off",
    );
  });

  it("labels an amount, trimming a whole-ringgit .00", () => {
    expect(
      describeDiscount({ ...shape, voucherType: "discount_amount", discountAmountCents: 500 }),
    ).toBe("MYR 5 off");
    expect(
      describeDiscount({ ...shape, voucherType: "discount_amount", discountAmountCents: 1250 }),
    ).toBe("MYR 12.50 off");
  });

  it("labels the non-numeric types", () => {
    expect(describeDiscount({ ...shape, voucherType: "freebie" })).toBe("Free item");
    expect(describeDiscount({ ...shape, voucherType: "bogo" })).toBe("Buy 1 free 1");
    expect(describeDiscount({ ...shape, voucherType: "bundle" })).toBe("Bundle deal");
  });

  it("degrades gracefully when the value is missing", () => {
    expect(describeDiscount({ ...shape, voucherType: "discount_percent" })).toBe("Discount");
  });
});

describe("campaign status machine", () => {
  it("allows draft → sending and sending → sent", () => {
    expect(canTransitionCampaign("draft", "sending")).toBe(true);
    expect(canTransitionCampaign("sending", "sent")).toBe(true);
  });

  it("makes sent terminal, so a campaign can never be sent twice", () => {
    expect(canTransitionCampaign("sent", "sending")).toBe(false);
    expect(canTransitionCampaign("sent", "draft")).toBe(false);
  });

  it("allows retrying a failed send", () => {
    expect(canTransitionCampaign("failed", "sending")).toBe(true);
  });
});

describe("usageMetricForChannel", () => {
  it("bills email and push, but not in-app", () => {
    expect(usageMetricForChannel("email")).toBe("email_sends");
    expect(usageMetricForChannel("push")).toBe("push_sends");
    expect(usageMetricForChannel("in_app")).toBeNull();
  });
});

describe("summariseDeliveries", () => {
  it("rolls statuses into rates", () => {
    const report = summariseDeliveries({ sent: 6, delivered: 2, opened: 1, clicked: 1, failed: 2 });
    expect(report.recipients).toBe(12);
    expect(report.reached).toBe(10); // sent + delivered + opened + clicked
    expect(report.failed).toBe(2);
    expect(report.opened).toBe(2); // opened + clicked
    expect(report.clicked).toBe(1);
    expect(report.deliveryRate).toBeCloseTo(83.3, 1);
    expect(report.openRate).toBe(20);
  });

  it("returns zeroed rates rather than NaN when nothing was sent", () => {
    const report = summariseDeliveries({});
    expect(report.recipients).toBe(0);
    expect(report.deliveryRate).toBe(0);
    expect(report.openRate).toBe(0);
    expect(report.clickRate).toBe(0);
  });

  it("counts bounced as failed", () => {
    expect(summariseDeliveries({ bounced: 3 }).failed).toBe(3);
  });
});
