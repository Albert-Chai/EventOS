import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  momentComments,
  momentLikes,
  momentPosts,
  visitors,
  type MomentComment,
  type NewMomentComment,
  type NewMomentLike,
} from "@/server/db/schema";

/**
 * Likes and comments on moments (docs/phase-10-moments-plan.md §9).
 *
 * Both scope the same way the posts repository does: the **public** reads filter
 * on the post plus `published`, because the caller has already resolved the
 * event through `findPublicEvent`; the **moderation** reads take a `tenantId`
 * the caller derived from `ctx.tenant.id` and return every status.
 */

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

/**
 * Adds a like, or reports that it was already there.
 *
 * `onConflictDoNothing` against `moment_likes_post_visitor_uq` is what makes a
 * double-tap (or a retried request) idempotent rather than a duplicate — the
 * count is derived from rows, so a second row would be a wrong number, not just
 * clutter.
 */
export async function insertLike(input: NewMomentLike): Promise<boolean> {
  const rows = await db
    .insert(momentLikes)
    .values(input)
    .onConflictDoNothing({ target: [momentLikes.momentPostId, momentLikes.visitorId] })
    .returning({ id: momentLikes.id });
  return rows.length > 0;
}

export async function deleteLike(momentPostId: string, visitorId: string): Promise<boolean> {
  const rows = await db
    .delete(momentLikes)
    .where(and(eq(momentLikes.momentPostId, momentPostId), eq(momentLikes.visitorId, visitorId)))
    .returning({ id: momentLikes.id });
  return rows.length > 0;
}

export async function countLikesForPost(momentPostId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(momentLikes)
    .where(eq(momentLikes.momentPostId, momentPostId));
  return Number(row?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Counts for the feed
// ---------------------------------------------------------------------------

/**
 * The like/comment counts and "did I like it" flags for a page of posts.
 *
 * One query for the whole page rather than three per post — a feed of 60 posts
 * would otherwise be 180 round trips, and the dev/test pooler runs at a single
 * connection. `visitorId` is the *viewer's* server-resolved row, or null when
 * nobody is signed in, in which case nothing is ever marked liked.
 */
export type MomentCounts = { likes: number; comments: number; likedByViewer: boolean };

export async function countsForPosts(
  postIds: readonly string[],
  viewerVisitorId: string | null,
): Promise<Map<string, MomentCounts>> {
  const result = new Map<string, MomentCounts>();
  if (postIds.length === 0) return result;

  const ids = sql.join(
    postIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<{
    id: string;
    likes: string;
    comments: string;
    liked: boolean;
  }>(sql`
    select
      p.id,
      (select count(*) from ${momentLikes} l where l.moment_post_id = p.id) as likes,
      (select count(*) from ${momentComments} c
        where c.moment_post_id = p.id and c.status = 'published') as comments,
      ${
        viewerVisitorId
          ? sql`exists(select 1 from ${momentLikes} lv
                where lv.moment_post_id = p.id and lv.visitor_id = ${viewerVisitorId}::uuid)`
          : sql`false`
      } as liked
    from ${momentPosts} p
    where p.id in (${ids})
  `);

  for (const row of rows) {
    result.set(row.id, {
      likes: Number(row.likes),
      comments: Number(row.comments),
      likedByViewer: Boolean(row.liked),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  visitorId: string;
  authorName: string | null;
};

const commentColumns = {
  id: momentComments.id,
  body: momentComments.body,
  createdAt: momentComments.createdAt,
  visitorId: momentComments.visitorId,
  authorName: visitors.displayName,
};

/** A post's published comments, oldest first — a thread reads forwards. */
export async function listPublishedComments(
  momentPostId: string,
  limit = 200,
): Promise<CommentRow[]> {
  return db
    .select(commentColumns)
    .from(momentComments)
    .innerJoin(visitors, eq(visitors.id, momentComments.visitorId))
    .where(
      and(eq(momentComments.momentPostId, momentPostId), eq(momentComments.status, "published")),
    )
    .orderBy(asc(momentComments.createdAt))
    .limit(limit);
}

/** The newest published comment per post, for the feed's one-line preview. */
export async function latestCommentsForPosts(
  postIds: readonly string[],
): Promise<Map<string, CommentRow>> {
  const result = new Map<string, CommentRow>();
  if (postIds.length === 0) return result;

  const ids = sql.join(
    postIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  // DISTINCT ON is Postgres' "latest row per group" — one pass, no window
  // function, and it rides the (moment_post_id, created_at) index.
  const rows = await db.execute<{
    moment_post_id: string;
    id: string;
    body: string;
    created_at: Date;
    visitor_id: string;
    author_name: string | null;
  }>(sql`
    select distinct on (c.moment_post_id)
      c.moment_post_id, c.id, c.body, c.created_at, c.visitor_id,
      v.display_name as author_name
    from ${momentComments} c
    join ${visitors} v on v.id = c.visitor_id
    where c.moment_post_id in (${ids}) and c.status = 'published'
    order by c.moment_post_id, c.created_at desc
  `);

  for (const row of rows) {
    result.set(row.moment_post_id, {
      id: row.id,
      body: row.body,
      createdAt: new Date(row.created_at),
      visitorId: row.visitor_id,
      authorName: row.author_name,
    });
  }
  return result;
}

export async function insertComment(input: NewMomentComment): Promise<MomentComment> {
  const [row] = await db.insert(momentComments).values(input).returning();
  return row;
}

/** Unscoped by tenant on purpose: keyed by comment id, ownership checked above. */
export async function findCommentById(id: string): Promise<MomentComment | null> {
  const [row] = await db.select().from(momentComments).where(eq(momentComments.id, id)).limit(1);
  return row ?? null;
}

export async function markCommentDeleted(id: string): Promise<MomentComment | null> {
  const [row] = await db
    .update(momentComments)
    .set({ status: "deleted" })
    .where(eq(momentComments.id, id))
    .returning();
  return row ?? null;
}

/** Tenant-scoped moderation write. Returns null when the comment isn't theirs. */
export async function setCommentStatus(
  tenantId: string,
  id: string,
  patch: {
    status: string;
    hiddenReason?: string | null;
    hiddenBy?: string | null;
    hiddenAt?: Date | null;
  },
): Promise<MomentComment | null> {
  const [row] = await db
    .update(momentComments)
    .set({
      status: patch.status,
      hiddenReason: patch.hiddenReason ?? null,
      hiddenBy: patch.hiddenBy ?? null,
      hiddenAt: patch.hiddenAt ?? null,
    })
    .where(and(eq(momentComments.id, id), eq(momentComments.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export type CommentModerationRow = CommentRow & {
  status: string;
  hiddenReason: string | null;
  postId: string;
  postBody: string | null;
};

/** The organiser's comment queue for one event — every status, tenant-scoped. */
export async function listCommentsForModeration(
  tenantId: string,
  eventId: string,
  limit = 100,
): Promise<CommentModerationRow[]> {
  return db
    .select({
      ...commentColumns,
      status: momentComments.status,
      hiddenReason: momentComments.hiddenReason,
      postId: momentComments.momentPostId,
      postBody: momentPosts.body,
    })
    .from(momentComments)
    .innerJoin(visitors, eq(visitors.id, momentComments.visitorId))
    .innerJoin(momentPosts, eq(momentPosts.id, momentComments.momentPostId))
    .where(and(eq(momentComments.tenantId, tenantId), eq(momentComments.eventId, eventId)))
    .orderBy(desc(momentComments.createdAt))
    .limit(limit);
}
