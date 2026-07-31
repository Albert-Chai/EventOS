import { describe, expect, it } from "vitest";

import { hasActiveFilters, parseDirectoryParams } from "@/features/visitors/filters";

/**
 * The directory filter parser (spec §8.9) turns raw URL params into the typed
 * shape the search query consumes. Blank/garbage values must collapse to
 * `undefined` so they never reach the SQL as empty predicates — and, for the id
 * filters, so a malformed one never reaches Postgres as a `uuid` comparison and
 * comes back as a 500.
 */
const CATEGORY_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const ZONE_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

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
    expect(parseDirectoryParams({ category: CATEGORY_ID, zone: ZONE_ID })).toMatchObject({
      categoryId: CATEGORY_ID,
      zoneId: ZONE_ID,
    });
    expect(parseDirectoryParams({ category: "", zone: "" })).toMatchObject({
      categoryId: undefined,
      zoneId: undefined,
    });
  });

  it("drops a malformed id instead of letting it reach the query", () => {
    // These became `uuid` comparisons in SQL and surfaced as a 500. The chips
    // only ever emit real ids, so this is unreachable through the UI — but a URL
    // is public input, and it should degrade to "no such filter".
    for (const bad of ["abc", "1' or '1", "../../etc", "cat-1"]) {
      expect(parseDirectoryParams({ category: bad, zone: bad })).toMatchObject({
        categoryId: undefined,
        zoneId: undefined,
      });
    }
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
    expect(hasActiveFilters({ category: CATEGORY_ID })).toBe(true);
    expect(hasActiveFilters({ zone: ZONE_ID })).toBe(true);
    expect(hasActiveFilters({ halal: "1" })).toBe(true);
    expect(hasActiveFilters({ promo: "1" })).toBe(true);
    expect(hasActiveFilters({ priceMax: "10" })).toBe(true);
  });

  it("does not count a malformed id as an active filter", () => {
    // It was dropped from the query, so the results are unfiltered — offering to
    // "clear filters" that never applied would be a lie.
    expect(hasActiveFilters({ category: "abc" })).toBe(false);
    expect(hasActiveFilters({ zone: "abc" })).toBe(false);
  });
});
