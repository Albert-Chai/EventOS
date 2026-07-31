import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/uuid";

/**
 * The URL-id guard (src/lib/uuid.ts).
 *
 * Every value below used to reach Postgres as a `uuid` comparison and come back
 * as a **500** — on `/moments/<id>`, `/s/<bookingId>`, and the directory's
 * `category`/`zone` filters. Two problems: the wrong status, and a 500 confirms
 * to whoever is probing that their input reached the database. These cases are
 * pinned so the guard can't quietly regress.
 */
describe("isUuid", () => {
  it("accepts a canonical uuid in either case", () => {
    expect(isUuid("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed")).toBe(true);
    expect(isUuid("1B9D6BCD-BBFD-4B2D-9B5D-AB8DFBBD4BED")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects the shapes a hand-edited URL actually produces", () => {
    for (const bad of [
      "abc",
      "new",
      "",
      "   ",
      "1b9d6bcd-bbfd-4b2d-9b5d", // truncated
      "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed-extra", // trailing junk
      "1b9d6bcdbbfd4b2d9b5dab8dfbbd4bed", // unhyphenated
      "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4beg", // g is not hex
      "1' or '1",
      "../../etc/passwd",
      "%00",
    ]) {
      expect(isUuid(bad), `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });

  it("rejects a uuid with surrounding whitespace rather than trimming it", () => {
    // Trimming here would be a silent normalisation the caller didn't ask for;
    // a URL that carries whitespace around an id is malformed.
    expect(isUuid(" 1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed ")).toBe(false);
    expect(isUuid("1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed\n")).toBe(false);
  });

  it("handles a missing value without throwing", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
