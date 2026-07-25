import { describe, expect, it } from "vitest";

import { hasActiveFilters, parseDirectoryParams } from "@/features/visitors/filters";

/**
 * The directory filter parser (spec §8.9) turns raw URL params into the typed
 * shape the search query consumes. Blank/garbage values must collapse to
 * `undefined` so they never reach the SQL as empty predicates.
 */
describe("parseDirectoryParams", () => {
  it("returns all-undefined for empty params", () => {
    expect(parseDirectoryParams({})).toEqual({
      query: undefined,
      categoryId: undefined,
      zoneId: undefined,
      halal: undefined,
      promoOnly: undefined,
      priceMin: undefined,
      priceMax: undefined,
    });
  });

  it("trims the query and drops it when blank", () => {
    expect(parseDirectoryParams({ q: "  nasi lemak  " }).query).toBe("nasi lemak");
    expect(parseDirectoryParams({ q: "   " }).query).toBeUndefined();
  });

  it("maps toggle params only when explicitly '1'", () => {
    expect(parseDirectoryParams({ halal: "1", promo: "1" })).toMatchObject({
      halal: true,
      promoOnly: true,
    });
    // Anything other than "1" is treated as off (undefined, not false).
    expect(parseDirectoryParams({ halal: "0", promo: "true" })).toMatchObject({
      halal: undefined,
      promoOnly: undefined,
    });
  });

  it("passes category and zone ids through, blank drops out", () => {
    expect(parseDirectoryParams({ category: "cat-1", zone: "zone-1" })).toMatchObject({
      categoryId: "cat-1",
      zoneId: "zone-1",
    });
    expect(parseDirectoryParams({ category: "", zone: "" })).toMatchObject({
      categoryId: undefined,
      zoneId: undefined,
    });
  });

  it("parses non-negative prices and rejects junk", () => {
    expect(parseDirectoryParams({ priceMin: "5", priceMax: "20" })).toMatchObject({
      priceMin: 5,
      priceMax: 20,
    });
    expect(parseDirectoryParams({ priceMin: "-3", priceMax: "abc" })).toMatchObject({
      priceMin: undefined,
      priceMax: undefined,
    });
    expect(parseDirectoryParams({ priceMin: "0" }).priceMin).toBe(0);
  });
});

describe("hasActiveFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: "  " })).toBe(false);
    expect(hasActiveFilters({ halal: "0" })).toBe(false);
  });

  it("is true when any filter or search term is present", () => {
    expect(hasActiveFilters({ q: "food" })).toBe(true);
    expect(hasActiveFilters({ category: "cat-1" })).toBe(true);
    expect(hasActiveFilters({ zone: "zone-1" })).toBe(true);
    expect(hasActiveFilters({ halal: "1" })).toBe(true);
    expect(hasActiveFilters({ promo: "1" })).toBe(true);
    expect(hasActiveFilters({ priceMax: "10" })).toBe(true);
  });
});
