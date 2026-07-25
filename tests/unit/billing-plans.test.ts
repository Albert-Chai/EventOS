import { describe, expect, it } from "vitest";

import {
  formatPlanPrice,
  getPlan,
  isPlanTier,
  isUsageMetric,
  limitFor,
  METRICS,
  PLAN_TIERS,
  PLANS,
  planHasFeature,
  usagePeriod,
  usageRatio,
  USAGE_METRICS,
  wouldExceed,
} from "@/server/billing/plans";

/**
 * The plan/limit math (spec §9, §22). Pure and unit-critical — enforcement and
 * the billing dashboard both depend on it. A missing/absent limit means
 * "unlimited", never "zero".
 */
describe("plan definitions", () => {
  it("has a definition for every tier, ordered", () => {
    expect(PLAN_TIERS).toEqual(["starter", "growth", "professional", "enterprise"]);
    for (const key of PLAN_TIERS) expect(PLANS[key].key).toBe(key);
  });

  it("only uses valid usage metrics as limit keys", () => {
    for (const key of PLAN_TIERS) {
      for (const metric of Object.keys(PLANS[key].limits)) {
        expect(isUsageMetric(metric), `${key} → ${metric}`).toBe(true);
      }
    }
  });

  it("defines metadata for every metric", () => {
    for (const metric of USAGE_METRICS) {
      expect(METRICS[metric]).toBeDefined();
    }
  });

  it("enterprise is unlimited (no numeric limits) and has every feature", () => {
    expect(Object.keys(PLANS.enterprise.limits)).toHaveLength(0);
    expect(planHasFeature(PLANS.enterprise, "white_label")).toBe(true);
    expect(planHasFeature(PLANS.enterprise, "api_access")).toBe(true);
  });

  it("gates featured listings to Growth and up", () => {
    expect(planHasFeature(PLANS.starter, "featured_listings")).toBe(false);
    expect(planHasFeature(PLANS.growth, "featured_listings")).toBe(true);
    expect(planHasFeature(PLANS.professional, "featured_listings")).toBe(true);
  });

  it("resolves and validates tier keys", () => {
    expect(isPlanTier("growth")).toBe(true);
    expect(isPlanTier("nonsense")).toBe(false);
    expect(getPlan("growth")?.name).toBe("Growth");
    expect(getPlan("nonsense")).toBeNull();
  });
});

describe("limit math", () => {
  it("treats an absent limit as unlimited", () => {
    expect(limitFor(PLANS.enterprise, "events")).toBeNull();
    expect(usageRatio(9999, null)).toBe(0);
    expect(wouldExceed(9999, null, 100)).toBe(false);
  });

  it("computes ratios and exceed correctly for finite limits", () => {
    expect(usageRatio(40, 50)).toBeCloseTo(0.8);
    expect(usageRatio(50, 50)).toBe(1);
    expect(wouldExceed(0, 1, 1)).toBe(false); // first event fits a limit of 1
    expect(wouldExceed(1, 1, 1)).toBe(true); // second does not
    expect(wouldExceed(49, 50, 1)).toBe(false);
    expect(wouldExceed(50, 50, 1)).toBe(true);
  });

  it("handles a zero limit (feature effectively off)", () => {
    expect(wouldExceed(0, 0, 1)).toBe(true);
    expect(usageRatio(0, 0)).toBe(0);
    expect(usageRatio(1, 0)).toBe(Infinity);
  });

  it("reads the starter merchants-per-event and events limits", () => {
    expect(limitFor(PLANS.starter, "events")).toBe(1);
    expect(limitFor(PLANS.starter, "merchants_per_event")).toBe(50);
    expect(limitFor(PLANS.growth, "merchants_per_event")).toBe(200);
  });
});

describe("usagePeriod", () => {
  it("formats a UTC YYYY-MM bucket", () => {
    expect(usagePeriod(new Date("2026-07-25T12:00:00Z"))).toBe("2026-07");
    expect(usagePeriod(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(usagePeriod(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });
});

describe("formatPlanPrice", () => {
  it("formats sen into RM with thousands separators", () => {
    expect(formatPlanPrice(99_900, "MYR")).toBe("RM999");
    expect(formatPlanPrice(299_900, "MYR")).toBe("RM2,999");
    expect(formatPlanPrice(799_900, "MYR")).toBe("RM7,999");
  });

  it("shows Custom for an unpriced plan", () => {
    expect(formatPlanPrice(null)).toBe("Custom");
  });
});
