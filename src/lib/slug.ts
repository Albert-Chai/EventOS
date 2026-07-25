/**
 * Slug generation and validation for tenant and (later) event/merchant slugs.
 * Lowercase, ASCII, hyphen-separated; the shape that is safe in a URL path.
 */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reserved at the path level so a tenant slug can never shadow a real route. */
const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "dashboard",
  "platform",
  "merchant",
  "sign-in",
  "sign-up",
  "invitations",
  "explore",
  "about",
  "privacy",
  "terms",
  "admin",
  "www",
]);

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= 3 && slug.length <= 48 && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug)
  );
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
