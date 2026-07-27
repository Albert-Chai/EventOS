/**
 * UTC day-key helpers for the analytics rollups (`YYYY-MM-DD`). Pure and
 * dependency-free so they can be unit-tested without loading the database layer.
 */

/** Formats a Date as its UTC `YYYY-MM-DD` day key. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC day before the given moment — the default target for a nightly run. */
export function yesterdayKey(now: Date): string {
  return toDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}
