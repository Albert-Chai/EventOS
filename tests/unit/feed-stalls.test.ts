import { describe, expect, it } from "vitest";

import { stallsInFeed } from "@/features/moments/feed-stalls";

/**
 * The Moments desktop rail. It summarises the posts already on the page, so the
 * aggregation has to hold up on the messy shapes a feed actually contains:
 * untagged posts, tagged posts with no rating, and a stall posted about twice.
 */
const post = (
  merchantSlug: string | null,
  rating: number | null,
  merchantName = merchantSlug ? merchantSlug.toUpperCase() : null,
) => ({ merchantSlug, merchantName, rating });

describe("stallsInFeed", () => {
  it("is empty for an empty feed", () => {
    expect(stallsInFeed([])).toEqual([]);
  });

  it("ignores posts with no stall tagged", () => {
    // A post can be a plain photo of the festival — it belongs to no stall.
    expect(stallsInFeed([post(null, null), post(null, 5)])).toEqual([]);
  });

  it("counts posts per stall and averages the ratings present", () => {
    const rows = stallsInFeed([post("satay", 5), post("satay", 4), post("cendol", 3)]);
    expect(rows).toEqual([
      { slug: "satay", name: "SATAY", posts: 2, rating: 4.5 },
      { slug: "cendol", name: "CENDOL", posts: 1, rating: 3 },
    ]);
  });

  it("reports a null rating rather than a zero when nobody rated", () => {
    // Zero would render as "★ 0.0" — worse than saying nothing.
    expect(stallsInFeed([post("satay", null)])[0]!.rating).toBeNull();
  });

  it("averages only the ratings given, not every post", () => {
    // Two posts, one rating: the average is that rating, not halved.
    expect(stallsInFeed([post("satay", 4), post("satay", null)])[0]!.rating).toBe(4);
  });

  it("orders by post count, then rating, then name", () => {
    const rows = stallsInFeed([
      post("cendol", 3),
      post("ayam", 5),
      post("satay", 4),
      post("satay", 4),
    ]);
    expect(rows.map((r) => r.slug)).toEqual(["satay", "ayam", "cendol"]);
  });
});
