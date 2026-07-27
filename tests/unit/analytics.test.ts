import { describe, expect, it } from "vitest";

import { deriveTrafficSource, parseUserAgent } from "@/lib/client-signals";
import { toCsv } from "@/lib/csv";
import { toDateKey, yesterdayKey } from "@/lib/date-keys";
import { generateShortCode } from "@/lib/short-code";
import { resolveDays } from "@/features/analytics/format";
import {
  isAnalyticsEvent,
  isClientTrackable,
  isQrTargetType,
} from "@/server/analytics/taxonomy";

/**
 * Phase 7 pure logic (spec §25, §8.10, §8.14): device/source parsing, CSV
 * escaping, short-code shape, taxonomy guards, and day-key math. No database.
 */

describe("parseUserAgent", () => {
  it("classifies iPhone Safari as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toEqual({ deviceType: "mobile", browser: "Safari" });
  });

  it("classifies desktop Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(parseUserAgent(ua)).toEqual({ deviceType: "desktop", browser: "Chrome" });
  });

  it("classifies iPad as tablet", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1";
    expect(parseUserAgent(ua).deviceType).toBe("tablet");
  });

  it("detects Edge before Chrome/Safari", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0";
    expect(parseUserAgent(ua).browser).toBe("Edge");
  });

  it("flags bots so they don't count as visitors", () => {
    expect(parseUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)").deviceType).toBe("bot");
  });

  it("returns unknown for an empty UA", () => {
    expect(parseUserAgent(null)).toEqual({ deviceType: "unknown", browser: "unknown" });
  });
});

describe("deriveTrafficSource", () => {
  const self = "app.eventos.my";
  it("returns direct with no referrer", () => {
    expect(deriveTrafficSource(null, self)).toBe("direct");
  });
  it("returns internal for the same host (ignoring www)", () => {
    expect(deriveTrafficSource("https://www.app.eventos.my/kl-food/street", self)).toBe("internal");
  });
  it("returns the external host", () => {
    expect(deriveTrafficSource("https://www.google.com/search?q=x", self)).toBe("google.com");
  });
  it("treats a malformed referrer as direct", () => {
    expect(deriveTrafficSource("not a url", self)).toBe("direct");
  });
});

describe("toCsv", () => {
  const cols = [
    { header: "name", value: (r: { name: string; n: number }) => r.name },
    { header: "n", value: (r: { name: string; n: number }) => r.n },
  ];

  it("writes a header and rows", () => {
    const csv = toCsv([{ name: "a", n: 1 }], cols);
    expect(csv).toBe("name,n\r\na,1\r\n");
  });

  it("quotes fields with commas, quotes, or newlines", () => {
    const csv = toCsv([{ name: 'sa,te "y"', n: 2 }], cols);
    expect(csv).toContain('"sa,te ""y"""');
  });

  it("neutralises a leading formula character", () => {
    const csv = toCsv([{ name: "=1+2", n: 0 }], cols);
    expect(csv).toContain("'=1+2");
  });
});

describe("generateShortCode", () => {
  it("has the requested length and a URL-safe alphabet", () => {
    const code = generateShortCode(8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it("is practically unique across many draws", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateShortCode()));
    expect(seen.size).toBe(500);
  });
});

describe("taxonomy guards", () => {
  it("recognises a valid event name", () => {
    expect(isAnalyticsEvent("qr_scanned")).toBe(true);
    expect(isAnalyticsEvent("nope")).toBe(false);
  });

  it("only allows the client-trackable subset from the beacon", () => {
    expect(isClientTrackable("event_viewed")).toBe(true);
    // Favourite/QR events must originate server-side, never the beacon.
    expect(isClientTrackable("merchant_favourited")).toBe(false);
    expect(isClientTrackable("qr_scanned")).toBe(false);
  });

  it("recognises QR target types", () => {
    expect(isQrTargetType("merchant")).toBe(true);
    expect(isQrTargetType("spaceship")).toBe(false);
  });
});

describe("day keys & range", () => {
  it("formats a UTC day key", () => {
    expect(toDateKey(new Date("2026-07-25T18:30:00Z"))).toBe("2026-07-25");
  });
  it("computes yesterday", () => {
    expect(yesterdayKey(new Date("2026-07-25T00:30:00Z"))).toBe("2026-07-24");
  });
  it("clamps the days window to a supported value", () => {
    expect(resolveDays("7")).toBe(7);
    expect(resolveDays("30")).toBe(30);
    expect(resolveDays("90")).toBe(90);
    expect(resolveDays("999")).toBe(30);
    expect(resolveDays(undefined)).toBe(30);
  });
});
