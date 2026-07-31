import { isUuid } from "@/lib/uuid";
import type { DirectoryFilters } from "@/server/db/repositories/directory.repository";

/**
 * Parsing the directory's URL search params into typed filters (spec §8.9). Kept
 * pure and separate from the page so it's unit-testable without a database: the
 * page reads params, this turns them into a `DirectoryFilters`, and the
 * repository runs the query. Unknown/blank values collapse to `undefined` so they
 * drop out of the SQL entirely.
 *
 * "Unknown" includes **malformed ids**. `category` and `zone` become `uuid`
 * comparisons; a hand-typed one used to reach Postgres and come back as a 500.
 * The filter chips only ever emit real ids, so this is unreachable through the
 * UI — but a URL is public input, and it should degrade to "no such filter"
 * rather than an error page.
 */

export type DirectorySearchParams = {
  q?: string;
  category?: string;
  zone?: string;
  halal?: string;
  promo?: string;
  priceMin?: string;
  priceMax?: string;
};

function nonNegativeNumber(value: string | undefined): number | undefined {
  if (value == null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** An id-shaped filter, or `undefined` so it drops out of the query. */
function idFilter(value: string | undefined): string | undefined {
  return isUuid(value) ? value : undefined;
}

export function parseDirectoryParams(sp: DirectorySearchParams): DirectoryFilters {
  const query = sp.q?.trim();
  return {
    query: query ? query : undefined,
    categoryId: idFilter(sp.category),
    zoneId: idFilter(sp.zone),
    halal: sp.halal === "1" || undefined,
    promoOnly: sp.promo === "1" || undefined,
    priceMin: nonNegativeNumber(sp.priceMin),
    priceMax: nonNegativeNumber(sp.priceMax),
  };
}

/**
 * True when any filter or search term is active — drives the empty-state copy.
 *
 * Uses the same id guard as the parser on purpose: a malformed `category` is
 * dropped from the query, so the results are unfiltered, and claiming a filter
 * is active would offer to "clear filters" that never applied.
 */
export function hasActiveFilters(sp: DirectorySearchParams): boolean {
  return Boolean(
    sp.q?.trim() ||
      idFilter(sp.category) ||
      idFilter(sp.zone) ||
      sp.halal === "1" ||
      sp.promo === "1" ||
      nonNegativeNumber(sp.priceMin) != null ||
      nonNegativeNumber(sp.priceMax) != null,
  );
}
