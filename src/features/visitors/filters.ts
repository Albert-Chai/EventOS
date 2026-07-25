import type { DirectoryFilters } from "@/server/db/repositories/directory.repository";

/**
 * Parsing the directory's URL search params into typed filters (spec §8.9). Kept
 * pure and separate from the page so it's unit-testable without a database: the
 * page reads params, this turns them into a `DirectoryFilters`, and the
 * repository runs the query. Unknown/blank values collapse to `undefined` so they
 * drop out of the SQL entirely.
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

export function parseDirectoryParams(sp: DirectorySearchParams): DirectoryFilters {
  const query = sp.q?.trim();
  return {
    query: query ? query : undefined,
    categoryId: sp.category || undefined,
    zoneId: sp.zone || undefined,
    halal: sp.halal === "1" || undefined,
    promoOnly: sp.promo === "1" || undefined,
    priceMin: nonNegativeNumber(sp.priceMin),
    priceMax: nonNegativeNumber(sp.priceMax),
  };
}

/** True when any filter or search term is active — drives the empty-state copy. */
export function hasActiveFilters(sp: DirectorySearchParams): boolean {
  return Boolean(
    sp.q?.trim() ||
      sp.category ||
      sp.zone ||
      sp.halal === "1" ||
      sp.promo === "1" ||
      nonNegativeNumber(sp.priceMin) != null ||
      nonNegativeNumber(sp.priceMax) != null,
  );
}
