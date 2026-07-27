import { describe, expect, it } from "vitest";

import { countUsageFlags, planDistribution } from "@/server/platform/summary";
import type { MetricUsage } from "@/server/services/usage.service";

/**
 * The platform-console pure summarizers (see `docs/platform-admin-plan.md`).
 * These carry the rows → summary logic; the service does only I/O around them.
 */

describe("planDistribution", () => {
  it("counts tenants per tier and zero-fills absent tiers, in canonical order", () => {
    const rows = planDistribution(["growth", "starter", "growth", "enterprise"]);
    expect(rows.map((r) => r.key)).toEqual(["starter", "growth", "professional", "enterprise"]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.count]));
    expect(byKey).toEqual({ starter: 1, growth: 2, professional: 0, enterprise: 1 });
  });

  it("names each tier and totals to the input length", () => {
    const rows = planDistribution(["starter", "starter", "professional"]);
    expect(rows.find((r) => r.key === "starter")?.name).toBe("Starter");
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(3);
  });

  it("ignores unknown keys rather than throwing", () => {
    const rows = planDistribution(["starter", "mystery-tier", ""]);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(1);
  });

  it("returns all-zero for no tenants", () => {
    expect(planDistribution([]).every((r) => r.count === 0)).toBe(true);
  });
});

describe("countUsageFlags", () => {
  const metric = (over: boolean, warn: boolean): MetricUsage => ({
    metric: "events",
    label: "Active events",
    unit: "count",
    perEvent: false,
    hard: true,
    current: 0,
    limit: 10,
    ratio: 0,
    warn,
    over,
  });

  it("tallies over and warn independently, counting an over metric only as over", () => {
    expect(countUsageFlags([metric(true, true), metric(false, true), metric(false, false)])).toEqual(
      { over: 1, warn: 1 },
    );
  });

  it("is all-zero when nothing is flagged", () => {
    expect(countUsageFlags([metric(false, false), metric(false, false)])).toEqual({
      over: 0,
      warn: 0,
    });
  });

  it("handles an empty metric list", () => {
    expect(countUsageFlags([])).toEqual({ over: 0, warn: 0 });
  });
});
