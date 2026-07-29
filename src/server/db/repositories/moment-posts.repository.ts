import { and, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import {
  files,
  merchantEventParticipations,
  merchants,
  momentPosts,
  visitors,
  type MomentPost,
  type NewMomentPost,
} from "@/server/db/schema";

/**
 * Moment posts — the visitor feed (docs/phase-10-moments-plan.md).
 *
 * Two shapes of read live here and they scope differently, deliberately:
 *
 *  - the **public feed** filters on the event + `published`, exactly like every
 *    other public surface (§1 rule 6). The caller has already resolved the event
 *    through `findPublicEvent`, so visibility is enforced upstream.
 *  - the **moderation queue** is tenant-scoped: it takes a `tenantId` the caller
 *    derived from `ctx.tenant.id` and returns every status.
 */

/**
 * The SQL mirror of `isPubliclyVisible` in `server/moments/status.ts`. Keep the
 * two in step — the unit test asserts they agree on every status.
 */
export function visiblePredicate(): SQL {
  return eq(momentPosts.status, "published");
}

export type MomentFeedRow = {
  id: string;
  body: string | null;
  rating: number | null;
  createdAt: Date;
  visitorId: string;
  authorName: string | null;
  imageBucket: string | null;
  imagePath: string | null;
  merchantName: string | null;
  merchantSlug: string | null;
};

const feedColumns = {
  id: momentPosts.id,
  body: momentPosts.body,
  rating: momentPosts.rating,
  createdAt: momentPosts.createdAt,
  visitorId: momentPosts.visitorId,
  authorName: visitors.displayName,
  imageBucket: files.bucket,
  imagePath: files.path,
  merchantName: merchants.name,
  merchantSlug: merchants.slug,
};

/** The public feed for one event, newest first. */
export async function listPublishedPostsForEvent(
  eventId: string,
  limit = 60,
): Promise<MomentFeedRow[]> {
  return db
    .select(feedColumns)
    .from(momentPosts)
    .innerJoin(visitors, eq(visitors.id, momentPosts.visitorId))
    .leftJoin(files, eq(files.id, momentPosts.imageFileId))
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, momentPosts.participationId),
    )
    .leftJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(and(eq(momentPosts.eventId, eventId), visiblePredicate()))
    .orderBy(desc(momentPosts.createdAt))
    .limit(limit);
}

/** One published post in feed shape, for the post-detail page. */
export async function findPublishedPostForFeed(
  eventId: string,
  postId: string,
): Promise<MomentFeedRow | null> {
  const [row] = await db
    .select(feedColumns)
    .from(momentPosts)
    .innerJoin(visitors, eq(visitors.id, momentPosts.visitorId))
    .leftJoin(files, eq(files.id, momentPosts.imageFileId))
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, momentPosts.participationId),
    )
    .leftJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(
      and(eq(momentPosts.id, postId), eq(momentPosts.eventId, eventId), visiblePredicate()),
    )
    .limit(1);
  return row ?? null;
}

/** Published posts tagged to one stall, for a merchant page or a rating rollup. */
export async function listPublishedPostsForParticipation(
  participationId: string,
  limit = 30,
): Promise<MomentFeedRow[]> {
  return db
    .select(feedColumns)
    .from(momentPosts)
    .innerJoin(visitors, eq(visitors.id, momentPosts.visitorId))
    .leftJoin(files, eq(files.id, momentPosts.imageFileId))
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, momentPosts.participationId),
    )
    .leftJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(and(eq(momentPosts.participationId, participationId), visiblePredicate()))
    .orderBy(desc(momentPosts.createdAt))
    .limit(limit);
}

/** Average star rating per tagged stall for an event's published posts. */
export async function ratingSummaryForEvent(
  tenantId: string,
  eventId: string,
): Promise<Array<{ participationId: string; average: number; count: number }>> {
  const rows = await db
    .select({
      participationId: momentPosts.participationId,
      average: sql<string>`avg(${momentPosts.rating})`,
      count: sql<string>`count(*)`,
    })
    .from(momentPosts)
    .where(
      and(
        eq(momentPosts.tenantId, tenantId),
        eq(momentPosts.eventId, eventId),
        visiblePredicate(),
        sql`${momentPosts.rating} is not null`,
      ),
    )
    .groupBy(momentPosts.participationId);

  return rows
    .filter((r): r is typeof r & { participationId: string } => r.participationId !== null)
    .map((r) => ({
      participationId: r.participationId,
      average: Math.round(Number(r.average) * 10) / 10,
      count: Number(r.count),
    }));
}

export type ModerationRow = MomentFeedRow & {
  status: string;
  hiddenReason: string | null;
  hiddenAt: Date | null;
};

/** The organiser's moderation queue — every status, tenant-scoped. */
export async function listPostsForModeration(
  tenantId: string,
  eventId: string,
  limit = 100,
): Promise<ModerationRow[]> {
  return db
    .select({
      ...feedColumns,
      status: momentPosts.status,
      hiddenReason: momentPosts.hiddenReason,
      hiddenAt: momentPosts.hiddenAt,
    })
    .from(momentPosts)
    .innerJoin(visitors, eq(visitors.id, momentPosts.visitorId))
    .leftJoin(files, eq(files.id, momentPosts.imageFileId))
    .leftJoin(
      merchantEventParticipations,
      eq(merchantEventParticipations.id, momentPosts.participationId),
    )
    .leftJoin(merchants, eq(merchants.id, merchantEventParticipations.merchantId))
    .where(and(eq(momentPosts.tenantId, tenantId), eq(momentPosts.eventId, eventId)))
    .orderBy(desc(momentPosts.createdAt))
    .limit(limit);
}

export async function insertMomentPost(input: NewMomentPost): Promise<MomentPost> {
  const [row] = await db.insert(momentPosts).values(input).returning();
  return row;
}

/** Unscoped by tenant on purpose: the author's own post, keyed by post id. */
export async function findMomentPostById(id: string): Promise<MomentPost | null> {
  const [row] = await db.select().from(momentPosts).where(eq(momentPosts.id, id)).limit(1);
  return row ?? null;
}

export async function updateMomentPostImage(id: string, imageFileId: string): Promise<void> {
  await db.update(momentPosts).set({ imageFileId }).where(eq(momentPosts.id, id));
}

/** Tenant-scoped moderation write. Returns null when the post isn't the tenant's. */
export async function setMomentPostStatus(
  tenantId: string,
  id: string,
  patch: {
    status: string;
    hiddenReason?: string | null;
    hiddenBy?: string | null;
    hiddenAt?: Date | null;
  },
): Promise<MomentPost | null> {
  const [row] = await db
    .update(momentPosts)
    .set({
      status: patch.status,
      hiddenReason: patch.hiddenReason ?? null,
      hiddenBy: patch.hiddenBy ?? null,
      hiddenAt: patch.hiddenAt ?? null,
    })
    .where(and(eq(momentPosts.id, id), eq(momentPosts.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

/**
 * The author's own delete. Scoped by `visitor_id` rather than `tenant_id`: a
 * visitor has no tenant, and matching on their server-resolved visitor row is
 * exactly the ownership check — a post id alone is never enough.
 */
export async function deleteOwnMomentPost(
  id: string,
  visitorId: string,
): Promise<MomentPost | null> {
  const [row] = await db
    .update(momentPosts)
    .set({ status: "deleted" })
    .where(and(eq(momentPosts.id, id), eq(momentPosts.visitorId, visitorId)))
    .returning();
  return row ?? null;
}

export async function countPublishedPostsForEvent(eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(momentPosts)
    .where(and(eq(momentPosts.eventId, eventId), visiblePredicate()));
  return Number(row?.count ?? 0);
}
