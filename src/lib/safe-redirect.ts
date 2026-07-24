/**
 * Open-redirect guard (spec §20).
 *
 * Auth flows carry a `next` parameter through sign-in and the OAuth callback.
 * An attacker who controls that value can bounce a freshly authenticated user
 * to their own domain, so we only ever honour a same-origin *relative* path.
 *
 * Rejected: absolute URLs, protocol-relative (`//host`), backslash variants
 * that some parsers normalise to `//` (`/\host`), and anything containing
 * control characters or whitespace used to smuggle those forms past a check.
 */

/** Whitespace plus C0/C1 control characters. */
const UNSAFE_CHARS = /[\s\u0000-\u001F\u007F-\u009F]/;

/** A scheme cannot legitimately appear in a path we generate. */
const LOOKS_LIKE_SCHEME = /^\/+[a-z][a-z0-9+.-]*:/i;

export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;

  // Control characters are the usual way past a naive prefix check.
  if (UNSAFE_CHARS.test(value)) return fallback;

  // Must be rooted, and must not be protocol-relative in any spelling.
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  // Belt and braces against "/https:/evil.com" being re-parsed downstream.
  if (LOOKS_LIKE_SCHEME.test(value)) return fallback;

  return value;
}

/** Builds an absolute URL from a validated relative path. */
export function safeRedirectUrl(
  value: string | null | undefined,
  origin: string,
  fallback = "/",
): string {
  return new URL(safeRedirectPath(value, fallback), origin).toString();
}
