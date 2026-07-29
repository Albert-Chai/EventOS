/**
 * Coarse relative time for feeds — "2h ago", not a timestamp to the second.
 *
 * `now` is injectable so the function stays pure and testable; callers on the
 * server pass nothing and get the render time.
 */
export function timeAgo(from: Date, now: Date = new Date()): string {
  // Clamped at zero: a client clock running fast must not render "-3m ago".
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return from.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
