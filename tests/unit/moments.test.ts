import { describe, expect, it } from "vitest";

import {
  commentSchema,
  createMomentSchema,
  moderateMomentSchema,
} from "@/features/moments/schemas";
import { timeAgo } from "@/lib/time-ago";
import {
  averageRating,
  canAuthorDelete,
  canRemoveComment,
  hasCommentContent,
  hasMomentContent,
  isMomentStatus,
  isPubliclyVisible,
  isRatingAddressable,
  isValidRating,
  MOMENT_BODY_MAX,
  MOMENT_COMMENT_MAX,
  MOMENT_STATUSES,
} from "@/server/moments/status";

/**
 * Moments — the rules that must not drift (docs/phase-10-moments-plan.md).
 *
 * Each of these is enforced twice: here in the service's pure layer, and again
 * by a CHECK constraint or a scoped predicate in 0021. The tests pin the pure
 * half so a refactor can't quietly widen what the database still rejects.
 */

describe("moment statuses", () => {
  it("is a closed union", () => {
    expect([...MOMENT_STATUSES]).toEqual(["published", "hidden", "deleted"]);
  });

  it("recognises only its own members", () => {
    for (const status of MOMENT_STATUSES) expect(isMomentStatus(status)).toBe(true);
    expect(isMomentStatus("PUBLISHED")).toBe(false);
    expect(isMomentStatus("removed")).toBe(false);
    expect(isMomentStatus("")).toBe(false);
  });

  it("serves published posts only — hidden and deleted never reach the feed", () => {
    // The SQL mirror is `visiblePredicate()` in moment-posts.repository.ts:
    // status = 'published'. If this list ever grows, that predicate grows too.
    expect(isPubliclyVisible("published")).toBe(true);
    expect(isPubliclyVisible("hidden")).toBe(false);
    expect(isPubliclyVisible("deleted")).toBe(false);
    expect(isPubliclyVisible("anything-else")).toBe(false);
  });
});

describe("hasMomentContent", () => {
  it("accepts a photo with no caption", () => {
    expect(hasMomentContent({ body: null, hasImage: true })).toBe(true);
    expect(hasMomentContent({ body: "   ", hasImage: true })).toBe(true);
  });

  it("accepts a caption with no photo — text-only posts are allowed", () => {
    expect(hasMomentContent({ body: "Best laksa of the weekend", hasImage: false })).toBe(true);
  });

  it("rejects an empty post — 'text-only allowed' is not 'empty allowed'", () => {
    expect(hasMomentContent({ body: null, hasImage: false })).toBe(false);
    expect(hasMomentContent({ body: "", hasImage: false })).toBe(false);
    expect(hasMomentContent({ body: "   \n\t ", hasImage: false })).toBe(false);
  });
});

describe("isValidRating", () => {
  it("accepts whole stars 1 through 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(isValidRating(n)).toBe(true);
  });

  it("rejects out-of-range, fractional, and non-numeric values", () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(-1)).toBe(false);
    expect(isValidRating(4.5)).toBe(false);
    expect(isValidRating("5")).toBe(false);
    expect(isValidRating(null)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
  });
});

describe("isRatingAddressable", () => {
  it("allows a rating when a stall is tagged", () => {
    expect(isRatingAddressable({ rating: 4, participationId: "p1" })).toBe(true);
  });

  it("allows a post with no rating at all", () => {
    expect(isRatingAddressable({ rating: null, participationId: null })).toBe(true);
    expect(isRatingAddressable({ rating: null, participationId: "p1" })).toBe(true);
  });

  it("refuses a star with nothing to be about", () => {
    expect(isRatingAddressable({ rating: 5, participationId: null })).toBe(false);
  });
});

describe("canAuthorDelete", () => {
  it("lets the author remove their own live post", () => {
    expect(canAuthorDelete({ visitorId: "v1", status: "published" }, "v1")).toBe(true);
  });

  it("lets the author remove a post an organiser hid — it is still theirs", () => {
    expect(canAuthorDelete({ visitorId: "v1", status: "hidden" }, "v1")).toBe(true);
  });

  it("refuses another visitor's post", () => {
    expect(canAuthorDelete({ visitorId: "v1", status: "published" }, "v2")).toBe(false);
  });

  it("is a no-op on an already-deleted post", () => {
    expect(canAuthorDelete({ visitorId: "v1", status: "deleted" }, "v1")).toBe(false);
  });
});

describe("averageRating", () => {
  it("rounds to one decimal", () => {
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([5, 5])).toBe(5);
  });

  it("ignores values outside the 1–5 scale rather than skewing the mean", () => {
    expect(averageRating([5, 0, 9, 3])).toBe(4);
  });

  it("returns null when there is nothing to average", () => {
    expect(averageRating([])).toBeNull();
    expect(averageRating([0, 7])).toBeNull();
  });
});

describe("createMomentSchema", () => {
  const base = { tenantSlug: "kl-food", eventSlug: "weekend-flavours" };

  it("normalises empty optional fields to null", () => {
    const parsed = createMomentSchema.parse({ ...base, body: "", participationId: "", rating: "" });
    expect(parsed.body).toBeNull();
    expect(parsed.participationId).toBeNull();
    expect(parsed.rating).toBeNull();
  });

  it("parses a full post", () => {
    const id = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
    const parsed = createMomentSchema.parse({
      ...base,
      body: "  Great satay  ",
      participationId: id,
      rating: "5",
    });
    expect(parsed.body).toBe("Great satay");
    expect(parsed.participationId).toBe(id);
    expect(parsed.rating).toBe(5);
  });

  it("rejects a caption over the limit", () => {
    const parsed = createMomentSchema.safeParse({ ...base, body: "x".repeat(MOMENT_BODY_MAX + 1) });
    expect(parsed.success).toBe(false);
  });

  it("rejects a rating outside 1–5 and a non-uuid stall", () => {
    expect(createMomentSchema.safeParse({ ...base, rating: "6" }).success).toBe(false);
    expect(createMomentSchema.safeParse({ ...base, rating: "0" }).success).toBe(false);
    expect(createMomentSchema.safeParse({ ...base, participationId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("has no field a client could use to choose a tenant", () => {
    const parsed = createMomentSchema.parse({ ...base, tenantId: "someone-elses-tenant" });
    expect(parsed).not.toHaveProperty("tenantId");
  });
});

describe("canRemoveComment", () => {
  const post = { visitorId: "author" };

  it("lets the commenter remove their own comment", () => {
    expect(canRemoveComment({ visitorId: "me", status: "published" }, post, "me")).toBe(true);
  });

  it("lets the post's author remove a comment on their post", () => {
    // Your post is your space — waiting for an organiser to hide a nasty reply
    // is not a moderation story.
    expect(canRemoveComment({ visitorId: "someone", status: "published" }, post, "author")).toBe(
      true,
    );
  });

  it("refuses a bystander", () => {
    expect(canRemoveComment({ visitorId: "someone", status: "published" }, post, "nosy")).toBe(
      false,
    );
  });

  it("is a no-op on an already-deleted comment", () => {
    expect(canRemoveComment({ visitorId: "me", status: "deleted" }, post, "me")).toBe(false);
  });

  it("does not treat an anonymous viewer as the author", () => {
    // The service passes "" when nobody is signed in; an empty visitor id must
    // never match a real one.
    expect(canRemoveComment({ visitorId: "", status: "published" }, { visitorId: "" }, "")).toBe(
      true,
    );
    expect(canRemoveComment({ visitorId: "me", status: "published" }, post, "")).toBe(false);
  });
});

describe("hasCommentContent", () => {
  it("accepts real text", () => {
    expect(hasCommentContent("nice")).toBe(true);
  });

  it("rejects blank, whitespace-only, and missing bodies", () => {
    expect(hasCommentContent("")).toBe(false);
    expect(hasCommentContent("   \n\t ")).toBe(false);
    expect(hasCommentContent(null)).toBe(false);
    expect(hasCommentContent(undefined)).toBe(false);
  });
});

describe("commentSchema", () => {
  const id = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
  const base = { postId: id, tenantSlug: "kl-food", eventSlug: "weekend-flavours" };

  it("trims and accepts a comment", () => {
    expect(commentSchema.parse({ ...base, body: "  so good  " }).body).toBe("so good");
  });

  it("rejects blank and over-long comments", () => {
    expect(commentSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
    expect(
      commentSchema.safeParse({ ...base, body: "x".repeat(MOMENT_COMMENT_MAX + 1) }).success,
    ).toBe(false);
  });

  it("caps comments shorter than captions", () => {
    expect(MOMENT_COMMENT_MAX).toBeLessThan(MOMENT_BODY_MAX);
  });
});

describe("moderateMomentSchema", () => {
  const id = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

  it("accepts hide and restore only", () => {
    expect(moderateMomentSchema.safeParse({ eventId: id, postId: id, action: "hide" }).success).toBe(
      true,
    );
    expect(
      moderateMomentSchema.safeParse({ eventId: id, postId: id, action: "restore" }).success,
    ).toBe(true);
    expect(
      moderateMomentSchema.safeParse({ eventId: id, postId: id, action: "delete" }).success,
    ).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-07-29T12:00:00Z");
  const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

  it("reads as a feed, not a timestamp", () => {
    expect(ago(5_000)).toBe("just now");
    expect(ago(90_000)).toBe("2m ago");
    expect(ago(3 * 60 * 60 * 1000)).toBe("3h ago");
    expect(ago(2 * 24 * 60 * 60 * 1000)).toBe("2d ago");
  });

  it("falls back to a date past a week", () => {
    expect(ago(30 * 24 * 60 * 60 * 1000)).toMatch(/\w/);
  });

  it("never shows a negative age from a clock skew", () => {
    expect(timeAgo(new Date(now.getTime() + 60_000), now)).toBe("just now");
  });
});
