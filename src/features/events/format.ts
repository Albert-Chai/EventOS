import type { EventType } from "@/server/events/event-types";
import { EVENT_TYPE_LABELS } from "@/server/events/event-types";

/**
 * Server-safe formatting helpers (no `Date.now()`/`new Date()`, so they are pure
 * and can run during a Server Component render without tripping the purity lint).
 * Dates in and strings out.
 */

/** A `Date` → the `value` a `<input type="datetime-local">` expects, or "". */
export function toDateTimeLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Human date range in the event's own timezone. Falls back if the tz is bad. */
export function formatEventDates(
  startAt: Date | null,
  endAt: Date | null,
  timezone: string,
): string {
  if (!startAt) return "Dates not set";
  try {
    const fmt = new Intl.DateTimeFormat("en-MY", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    });
    if (!endAt) return fmt.format(startAt);
    return `${fmt.format(startAt)} — ${fmt.format(endAt)}`;
  } catch {
    const fmt = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" });
    return endAt ? `${fmt.format(startAt)} — ${fmt.format(endAt)}` : fmt.format(startAt);
  }
}

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType as EventType] ?? eventType;
}

/** "Sat, 1 Aug" from an ISO date string ("YYYY-MM-DD"). */
export function formatDayLabel(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-MY", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${dateStr}T00:00:00`));
  } catch {
    return dateStr;
  }
}

/** "10:00 – 22:00", or "Closed", from DB time strings ("HH:MM:SS"). */
export function formatTimeRange(
  opensAt: string | null,
  closesAt: string | null,
  isClosed: boolean,
): string {
  if (isClosed) return "Closed";
  if (!opensAt || !closesAt) return "—";
  return `${opensAt.slice(0, 5)} – ${closesAt.slice(0, 5)}`;
}

/** A maps link for the venue: precise if we have coordinates, else the address. */
export function venueMapUrl(
  latitude: number | null,
  longitude: number | null,
  venueAddress: string | null,
): string | null {
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  if (venueAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`;
  }
  return null;
}
