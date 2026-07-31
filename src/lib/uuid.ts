const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape-check for an id taken from a URL — a path segment or a query param.
 *
 * Postgres rejects a malformed `uuid` at parse time, so an unguarded id from the
 * URL surfaces as a driver error: a **500** where the honest answer is "no such
 * thing". That's two problems. It's the wrong status, and a 500 tells anyone
 * probing that their input reached the database, which a 404 does not.
 *
 * Guard at the boundary — before the value becomes part of a query — and either
 * 404 or drop the filter.
 */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}
