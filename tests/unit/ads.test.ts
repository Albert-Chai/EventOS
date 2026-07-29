import { describe, expect, it } from "vitest";

import {
  AD_SLOTS,
  isAdBookingStatus,
  isAdSlot,
  isBookingLive,
  isValidClickUrl,
  pickWeighted,
} from "@/server/ads/slots";

const NOW = new Date("2026-08-22T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("isBookingLive", () => {
  it("serves an active booking inside its window", () => {
    expect(isBookingLive({ status: "active", startsAt: day(-1), endsAt: day(1) }, NOW)).toBe(true);
  });

  it("treats null bounds as open-ended", () => {
    expect(isBookingLive({ status: "active", startsAt: null, endsAt: null }, NOW)).toBe(true);
    expect(isBookingLive({ status: "active", startsAt: day(-5), endsAt: null }, NOW)).toBe(true);
    expect(isBookingLive({ status: "active", startsAt: null, endsAt: day(5) }, NOW)).toBe(true);
  });

  it("does not serve before the flight starts or after it ends", () => {
    expect(isBookingLive({ status: "active", startsAt: day(1), endsAt: day(2) }, NOW)).toBe(false);
    expect(isBookingLive({ status: "active", startsAt: day(-3), endsAt: day(-1) }, NOW)).toBe(false);
  });

  it("never serves a non-active status, whatever the window", () => {
    for (const status of ["draft", "paused", "archived"] as const) {
      expect(isBookingLive({ status, startsAt: null, endsAt: null }, NOW)).toBe(false);
    }
  });

  it("is inclusive at both bounds — a flight is live on its own start and end instant", () => {
    expect(isBookingLive({ status: "active", startsAt: NOW, endsAt: day(1) }, NOW)).toBe(true);
    expect(isBookingLive({ status: "active", startsAt: day(-1), endsAt: NOW }, NOW)).toBe(true);
  });
});

describe("pickWeighted", () => {
  const a = { id: "a", weight: 1 };
  const b = { id: "b", weight: 3 };

  it("returns null only for an empty list", () => {
    expect(pickWeighted([], 0.5)).toBeNull();
    expect(pickWeighted([a], 0.5)).toBe(a);
  });

  it("splits the range by weight", () => {
    // total 4 → a owns [0, 0.25), b owns [0.25, 1)
    expect(pickWeighted([a, b], 0)).toBe(a);
    expect(pickWeighted([a, b], 0.2)).toBe(a);
    expect(pickWeighted([a, b], 0.25)).toBe(b);
    expect(pickWeighted([a, b], 0.99)).toBe(b);
  });

  it("never falls through at the top of the range", () => {
    // A caller passing exactly 1 (or a float artefact) must still get a booking.
    expect(pickWeighted([a, b], 1)).toBe(b);
    expect(pickWeighted([a, b], 1.5)).toBe(b);
  });

  it("floors a non-positive weight to 1 rather than dropping the booking", () => {
    const zero = { id: "zero", weight: 0 };
    const one = { id: "one", weight: 1 };
    // Both weigh 1 → an even split, so the zero-weight booking still serves.
    expect(pickWeighted([zero, one], 0.1)).toBe(zero);
    expect(pickWeighted([zero, one], 0.9)).toBe(one);
  });

  it("distributes roughly in proportion over many draws", () => {
    let bCount = 0;
    const draws = 4000;
    for (let i = 0; i < draws; i += 1) {
      if (pickWeighted([a, b], i / draws)?.id === "b") bCount += 1;
    }
    // b holds 3 of 4 of the range.
    expect(bCount / draws).toBeGreaterThan(0.7);
    expect(bCount / draws).toBeLessThan(0.8);
  });
});

describe("isValidClickUrl", () => {
  it("accepts http and https", () => {
    expect(isValidClickUrl("https://sponsor.example/promo")).toBe(true);
    expect(isValidClickUrl("http://sponsor.example")).toBe(true);
  });

  it("rejects anything that could execute or read local state", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "not a url",
      "",
    ]) {
      expect(isValidClickUrl(bad)).toBe(false);
    }
  });
});

describe("slot + status unions", () => {
  it("recognises every declared slot and rejects unknown ones", () => {
    for (const slot of AD_SLOTS) expect(isAdSlot(slot)).toBe(true);
    expect(isAdSlot("homepage_takeover")).toBe(false);
  });

  it("recognises booking statuses", () => {
    expect(isAdBookingStatus("active")).toBe(true);
    expect(isAdBookingStatus("live")).toBe(false);
  });
});
