import { describe, expect, it } from "vitest";

import { isReservedSlug, isValidSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(slugify("Kuala Lumpur Food Festival")).toBe("kuala-lumpur-food-festival");
    expect(slugify("  Trailing & Leading  ")).toBe("trailing-leading");
    expect(slugify("Über Näïve Café")).toBe("uber-naive-cafe");
  });

  it("collapses runs of separators and trims stray hyphens", () => {
    expect(slugify("a---b__c")).toBe("a-b-c");
    expect(slugify("!!!hello!!!")).toBe("hello");
  });

  it("caps length", () => {
    expect(slugify("x".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});

describe("isValidSlug", () => {
  it("accepts well-formed slugs", () => {
    expect(isValidSlug("kl-food-festival")).toBe(true);
    expect(isValidSlug("expo2026")).toBe(true);
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("ab")).toBe(false); // too short
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("has space")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
  });

  it("rejects reserved slugs that would shadow real routes", () => {
    expect(isValidSlug("dashboard")).toBe(false);
    expect(isValidSlug("platform")).toBe(false);
    expect(isValidSlug("api")).toBe(false);
    expect(isReservedSlug("sign-in")).toBe(true);
    expect(isReservedSlug("kl-expo")).toBe(false);
  });
});
