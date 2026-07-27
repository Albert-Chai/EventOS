/**
 * Presentation helpers for the analytics dashboards. Human labels for the raw
 * event names + compact number formatting.
 */

const numberFormat = new Intl.NumberFormat("en-MY");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Clamps a `?days=` param to a supported window; defaults to 30. */
export function resolveDays(raw: string | undefined): number {
  const n = Number(raw);
  return n === 7 || n === 30 || n === 90 ? n : 30;
}

/** A short label for a device bucket. */
export function deviceLabel(key: string): string {
  const map: Record<string, string> = {
    mobile: "Mobile",
    tablet: "Tablet",
    desktop: "Desktop",
    bot: "Bot",
    unknown: "Unknown",
  };
  return map[key] ?? key;
}

/** A short label for a traffic source bucket. */
export function sourceLabel(key: string): string {
  if (key === "direct") return "Direct";
  if (key === "internal") return "In-app";
  if (key === "unknown") return "Unknown";
  return key;
}
