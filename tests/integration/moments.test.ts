import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { momentComments, momentPosts, tenants, visitors } from "@/server/db/schema";
import {
  countLikesForPost,
  countsForPosts,
  deleteLike,
  insertComment,
  insertLike,
  latestCommentsForPosts,
  listCommentsForModeration,
  listPublishedComments,
  markCommentDeleted,
  setCommentStatus,
} from "@/server/db/repositories/moment-social.repository";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { insertParticipation } from "@/server/db/repositories/participations.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import {
  findVisitorByUserId,
  insertVisitor,
  linkVisitorToUser,
} from "@/server/db/repositories/visitors.repository";
import {
  countPublishedPostsForEvent,
  deleteOwnMomentPost,
  insertMomentPost,
  listPostsForModeration,
  listPublishedPostsForEvent,
  ratingSummaryForEvent,
  setMomentPostStatus,
} from "@/server/db/repositories/moment-posts.repository";

/**
 * Phase 10's slice: the guarantees that live in the *database*, not the service.
 *
 * The service validates the same content rules and returns friendly messages,
 * but validation can be bypassed by a future code path and a CHECK constraint
 * cannot — so these tests drive the repository directly, which is where the
 * constraints from 0021 actually bite. Runs against the seeded live database;
 * skips otherwise.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("moments (integration)", () => {
  const createdTenantIds: string[] = [];
  const createdVisitorIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let tenantA = "";
  let tenantB = "";
  let eventA = "";
  let eventB = "";
  let visitor1 = "";
  let visitor2 = "";
  let stallA = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const ta = await insertTenant({ name: "Mo A", slug: `mo-a-${stamp}`, createdBy: owner.id });
    const tb = await insertTenant({ name: "Mo B", slug: `mo-b-${stamp}`, createdBy: owner.id });
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    const ea = await createEventWithDefaults({
      tenantId: tenantA,
      name: "Mo Ev A",
      slug: `mo-ev-a-${stamp}`,
      createdBy: owner.id,
    });
    const eb = await createEventWithDefaults({
      tenantId: tenantB,
      name: "Mo Ev B",
      slug: `mo-ev-b-${stamp}`,
      createdBy: owner.id,
    });
    eventA = ea.id;
    eventB = eb.id;

    const merchant = await insertMerchant({
      tenantId: tenantA,
      name: "Mo Stall",
      slug: `mo-stall-${stamp}`,
    });
    const participation = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: merchant.id,
      approvalStatus: "approved",
    });
    stallA = participation.id;

    const v1 = await insertVisitor({ anonymousId: `mo-visitor-1-${stamp}` });
    const v2 = await insertVisitor({ anonymousId: `mo-visitor-2-${stamp}` });
    visitor1 = v1.id;
    visitor2 = v2.id;
    createdVisitorIds.push(visitor1, visitor2);
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (createdVisitorIds.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, createdVisitorIds));
    }
  });

  function post(overrides: Partial<Parameters<typeof insertMomentPost>[0]> = {}) {
    return insertMomentPost({
      tenantId: tenantA,
      eventId: eventA,
      visitorId: visitor1,
      body: "Great satay",
      ...overrides,
    });
  }

  /**
   * Drizzle wraps the driver error in a generic "Failed query: …", so the
   * constraint that actually fired is on `cause`. Naming it in the assertion is
   * the point — "it threw" would pass just as well if the row were rejected for
   * the wrong reason.
   */
  async function rejectedBy(work: Promise<unknown>): Promise<string> {
    try {
      await work;
    } catch (error) {
      const cause = (error as { cause?: { constraint_name?: string; constraint?: string } }).cause;
      return cause?.constraint_name ?? cause?.constraint ?? `unnamed: ${String(error)}`;
    }
    throw new Error("Expected the write to be rejected, but it succeeded.");
  }

  // --- Content rules (CHECK constraints from 0021) -------------------------

  it("allows a text-only post", async () => {
    const row = await post({ body: "No photo, still a moment" });
    expect(row.status).toBe("published");
    expect(row.imageFileId).toBeNull();
  });

  it("rejects a post with neither text nor a photo", async () => {
    expect(await rejectedBy(post({ body: null }))).toBe("moment_posts_has_content_ck");
  });

  it("rejects a blank-whitespace body as empty", async () => {
    expect(await rejectedBy(post({ body: "   \n  " }))).toBe("moment_posts_has_content_ck");
  });

  it("rejects a rating outside 1–5", async () => {
    // Tagged to a stall, so it's the range rule under test and not the
    // needs-a-stall rule shadowing it.
    expect(await rejectedBy(post({ rating: 0, participationId: stallA }))).toBe(
      "moment_posts_rating_range_ck",
    );
    expect(await rejectedBy(post({ rating: 6, participationId: stallA }))).toBe(
      "moment_posts_rating_range_ck",
    );
  });

  it("accepts a rating of 1 and 5 on a tagged stall", async () => {
    expect((await post({ rating: 1, participationId: stallA })).rating).toBe(1);
    expect((await post({ rating: 5, participationId: stallA })).rating).toBe(5);
  });

  it("refuses a star rating with no stall to be about", async () => {
    expect(await rejectedBy(post({ rating: 5, participationId: null }))).toBe(
      "moment_posts_rating_needs_stall_ck",
    );
  });

  // --- Visibility ----------------------------------------------------------

  it("serves published posts only", async () => {
    const live = await post({ body: `live-${stamp}` });
    const hidden = await post({ body: `hidden-${stamp}` });
    await setMomentPostStatus(tenantA, hidden.id, { status: "hidden", hiddenAt: new Date() });

    const feed = await listPublishedPostsForEvent(eventA);
    const ids = feed.map((p) => p.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(hidden.id);
  });

  it("drops a post the author deleted out of the feed but keeps it for the queue", async () => {
    const mine = await post({ body: `mine-${stamp}` });
    const removed = await deleteOwnMomentPost(mine.id, visitor1);
    expect(removed?.status).toBe("deleted");

    const feed = await listPublishedPostsForEvent(eventA);
    expect(feed.map((p) => p.id)).not.toContain(mine.id);

    const queue = await listPostsForModeration(tenantA, eventA);
    expect(queue.map((p) => p.id)).toContain(mine.id);
  });

  it("will not let one visitor delete another's post", async () => {
    const theirs = await post({ visitorId: visitor2, body: `theirs-${stamp}` });
    const attempt = await deleteOwnMomentPost(theirs.id, visitor1);
    expect(attempt).toBeNull();

    const [still] = await db.select().from(momentPosts).where(eq(momentPosts.id, theirs.id));
    expect(still.status).toBe("published");
  });

  // --- Tenant isolation ----------------------------------------------------

  it("never shows one tenant's posts in another's moderation queue", async () => {
    const inA = await post({ body: `only-in-a-${stamp}` });
    const queueB = await listPostsForModeration(tenantB, eventB);
    expect(queueB.map((p) => p.id)).not.toContain(inA.id);

    // Even naming the right event id from the wrong tenant returns nothing.
    const crossed = await listPostsForModeration(tenantB, eventA);
    expect(crossed).toHaveLength(0);
  });

  it("refuses a moderation write from the wrong tenant", async () => {
    const inA = await post({ body: `guarded-${stamp}` });
    const updated = await setMomentPostStatus(tenantB, inA.id, {
      status: "hidden",
      hiddenAt: new Date(),
    });
    expect(updated).toBeNull();

    const [untouched] = await db.select().from(momentPosts).where(eq(momentPosts.id, inA.id));
    expect(untouched.status).toBe("published");
  });

  it("counts and averages within one event only", async () => {
    const before = await countPublishedPostsForEvent(eventB);
    await post({ body: `not-in-b-${stamp}` });
    expect(await countPublishedPostsForEvent(eventB)).toBe(before);

    const summaryB = await ratingSummaryForEvent(tenantB, eventB);
    expect(summaryB).toHaveLength(0);
  });

  // --- Likes ---------------------------------------------------------------

  it("counts one like per visitor however many times they tap", async () => {
    const target = await post({ body: `likeable-${stamp}` });
    const like = { tenantId: tenantA, eventId: eventA, momentPostId: target.id };

    expect(await insertLike({ ...like, visitorId: visitor1 })).toBe(true);
    // The double-tap. onConflictDoNothing against moment_likes_post_visitor_uq
    // is what keeps the count honest rather than just tidy.
    expect(await insertLike({ ...like, visitorId: visitor1 })).toBe(false);
    expect(await countLikesForPost(target.id)).toBe(1);

    expect(await insertLike({ ...like, visitorId: visitor2 })).toBe(true);
    expect(await countLikesForPost(target.id)).toBe(2);
  });

  it("unlikes only the caller's own like", async () => {
    const target = await post({ body: `unlikeable-${stamp}` });
    const like = { tenantId: tenantA, eventId: eventA, momentPostId: target.id };
    await insertLike({ ...like, visitorId: visitor1 });
    await insertLike({ ...like, visitorId: visitor2 });

    expect(await deleteLike(target.id, visitor1)).toBe(true);
    expect(await countLikesForPost(target.id)).toBe(1);
    // Unliking twice is a no-op, not an error or a negative count.
    expect(await deleteLike(target.id, visitor1)).toBe(false);
    expect(await countLikesForPost(target.id)).toBe(1);
  });

  // --- Comments ------------------------------------------------------------

  it("rejects a blank comment at the database, not just the service", async () => {
    const target = await post({ body: `commentable-${stamp}` });
    expect(
      await rejectedBy(
        insertComment({
          tenantId: tenantA,
          eventId: eventA,
          momentPostId: target.id,
          visitorId: visitor1,
          body: "   \n  ",
        }),
      ),
    ).toBe("moment_comments_has_body_ck");
  });

  it("shows published comments and hides moderated ones", async () => {
    const target = await post({ body: `thread-${stamp}` });
    const base = {
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: target.id,
      visitorId: visitor1,
    };
    const live = await insertComment({ ...base, body: "first" });
    const hidden = await insertComment({ ...base, body: "second" });
    const removed = await insertComment({ ...base, body: "third" });

    await setCommentStatus(tenantA, hidden.id, { status: "hidden", hiddenAt: new Date() });
    await markCommentDeleted(removed.id);

    const thread = await listPublishedComments(target.id);
    const ids = thread.map((c) => c.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(hidden.id);
    expect(ids).not.toContain(removed.id);

    // The organiser's queue still shows all three.
    const queue = await listCommentsForModeration(tenantA, eventA);
    const queueIds = queue.map((c) => c.id);
    expect(queueIds).toEqual(expect.arrayContaining([live.id, hidden.id, removed.id]));
  });

  it("refuses a comment moderation write from the wrong tenant", async () => {
    const target = await post({ body: `guarded-thread-${stamp}` });
    const comment = await insertComment({
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: target.id,
      visitorId: visitor1,
      body: "hands off",
    });

    expect(await setCommentStatus(tenantB, comment.id, { status: "hidden" })).toBeNull();
    const [untouched] = await db
      .select()
      .from(momentComments)
      .where(eq(momentComments.id, comment.id));
    expect(untouched.status).toBe("published");

    const crossed = await listCommentsForModeration(tenantB, eventA);
    expect(crossed).toHaveLength(0);
  });

  it("counts likes and comments per post in one pass, per viewer", async () => {
    const a = await post({ body: `counts-a-${stamp}` });
    const b = await post({ body: `counts-b-${stamp}` });
    const like = { tenantId: tenantA, eventId: eventA };

    await insertLike({ ...like, momentPostId: a.id, visitorId: visitor1 });
    await insertLike({ ...like, momentPostId: a.id, visitorId: visitor2 });
    await insertComment({
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: a.id,
      visitorId: visitor2,
      body: "counted",
    });

    const forVisitor1 = await countsForPosts([a.id, b.id], visitor1);
    expect(forVisitor1.get(a.id)).toEqual({ likes: 2, comments: 1, likedByViewer: true });
    expect(forVisitor1.get(b.id)).toEqual({ likes: 0, comments: 0, likedByViewer: false });

    // The same posts, a viewer who liked nothing — the counts are shared, the
    // "did I like it" flag is not.
    const anonymous = await countsForPosts([a.id, b.id], null);
    expect(anonymous.get(a.id)).toEqual({ likes: 2, comments: 1, likedByViewer: false });
  });

  it("previews the newest comment per post", async () => {
    const target = await post({ body: `preview-${stamp}` });
    const base = {
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: target.id,
      visitorId: visitor1,
    };
    await insertComment({ ...base, body: "older" });
    await insertComment({ ...base, body: "newest" });

    const previews = await latestCommentsForPosts([target.id]);
    expect(previews.get(target.id)?.body).toBe("newest");
  });

  it("removes a post's likes and comments with it", async () => {
    const target = await post({ body: `cascade-${stamp}` });
    await insertLike({
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: target.id,
      visitorId: visitor1,
    });
    await insertComment({
      tenantId: tenantA,
      eventId: eventA,
      momentPostId: target.id,
      visitorId: visitor1,
      body: "bye",
    });

    await db.delete(momentPosts).where(eq(momentPosts.id, target.id));
    expect(await countLikesForPost(target.id)).toBe(0);
    expect(await listPublishedComments(target.id)).toHaveLength(0);
  });

  // --- The account link ----------------------------------------------------

  it("claims an anonymous visitor row for an account, keeping its history", async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing.");

    const anon = await insertVisitor({ anonymousId: `mo-link-${stamp}` });
    createdVisitorIds.push(anon.id);

    const linked = await linkVisitorToUser(anon.id, {
      userId: owner.id,
      displayName: "Owner",
      email: "organizer.owner@eventos.test",
    });
    expect(linked?.id).toBe(anon.id); // same row — favourites survive
    expect(await findVisitorByUserId(owner.id)).not.toBeNull();

    // A second claim of the same account must not fork the identity.
    const other = await insertVisitor({ anonymousId: `mo-link2-${stamp}` });
    createdVisitorIds.push(other.id);
    expect(
      await rejectedBy(linkVisitorToUser(other.id, { userId: owner.id, displayName: "Owner" })),
    ).toBe("visitors_user_id_uq");

    // Reset so the seeded owner isn't left linked to a throwaway visitor row.
    await db.update(visitors).set({ userId: null }).where(eq(visitors.id, anon.id));
  });
});
