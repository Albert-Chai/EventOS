/**
 * Deriving coarse client signals from request headers (spec §25 event
 * properties). Deliberately tiny and dependency-free: a full UA-parsing library
 * would be a large dependency for the handful of buckets the dashboards show. We
 * only need device class and a browser family, and only an *approximate* traffic
 * source — never precise fingerprinting or geolocation (§8.10).
 */

export type DeviceType = "mobile" | "tablet" | "desktop" | "bot" | "unknown";

/** Classifies a User-Agent into a device bucket + browser family. */
export function parseUserAgent(ua: string | null | undefined): {
  deviceType: DeviceType;
  browser: string;
} {
  if (!ua) return { deviceType: "unknown", browser: "unknown" };
  const s = ua.toLowerCase();

  // Bots first — they set desktop-looking UAs but shouldn't count as visitors.
  if (/bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview/.test(s)) {
    return { deviceType: "bot", browser: "bot" };
  }

  const isTablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s);
  const isMobile = /iphone|ipod|android.*mobile|windows phone|blackberry|bb10|mobile/.test(s);
  const deviceType: DeviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  // Order matters: Edge/Chrome UAs also contain "safari"; Chrome contains "safari".
  let browser = "other";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/firefox\/|fxios/.test(s)) browser = "Firefox";
  else if (/chrome\/|crios/.test(s)) browser = "Chrome";
  else if (/safari\//.test(s)) browser = "Safari";

  return { deviceType, browser };
}

/**
 * Reduces a referrer to a coarse traffic source: `direct` (no referrer),
 * `internal` (same host — an in-app navigation), or the external referrer host
 * (e.g. `google.com`). Never stores the full referring URL as the source.
 */
export function deriveTrafficSource(
  referrer: string | null | undefined,
  selfHost: string | null | undefined,
): string {
  if (!referrer) return "direct";
  let host: string;
  try {
    host = new URL(referrer).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  if (!host) return "direct";
  const self = (selfHost ?? "").toLowerCase().replace(/^www\./, "");
  if (self && host === self) return "internal";
  return host;
}
