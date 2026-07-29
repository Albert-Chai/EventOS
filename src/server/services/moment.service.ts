import { AppError } from "@/lib/api/errors";
import { getRequestContext } from "@/server/auth/session";
import type { AuthenticatedContext, TenantScopedContext } from "@/server/context";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import {
  countPublishedPostsForEvent,
  deleteOwnMomentPost,
  findMomentPostById,
  findPublishedPostForFeed,
  listPostsForModeration,
  listPublishedPostsForEvent,
  insertMomentPost,
  ratingSummaryForEvent,
  setMomentPostStatus,
  type ModerationRow,
  type MomentFeedRow,
} from "@/server/db/repositories/moment-posts.repository";
import { listPublicParticipations } from "@/server/db/repositories/participations.repository";
import {
  countLikesForPost,
  countsForPosts,
  deleteLike,
  findCommentById,
  insertComment,
  insertLike,
  latestCommentsForPosts,
  listCommentsForModeration,
  listPublishedComments,
  markCommentDeleted,
  setCommentStatus,
  type CommentModerationRow,
  type CommentRow,
  type MomentCounts,
} from "@/server/db/repositories/moment-social.repository";
import {
  canRemoveComment,
  hasCommentContent,
  hasMomentContent,
  isMomentId,
  isPubliclyVisible,
  isRatingAddressable,
  isValidRating,
  MOMENT_BODY_MAX,
  MOMENT_COMMENT_MAX,
} from "@/server/moments/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { captureRequestSignals, recordAnalyticsEvent } from "./analytics.service";
import { publicFileUrl } from "./media.service";
import { uploadImage } from "./media.service";
import { resolveSignedInVisitor } from "./visitor-account.service";

/**
 * Moments — visitor posts about an event (docs/phase-10-moments-plan.md).
 *
 * This is a **public write** surface, so it follows the same seam as a voucher
 * claim (§1 rule 6 / §6): the tenant and event are resolved from the URL slugs
 * via `findPublicEvent`, the author is resolved from the session, and nothing
 * the client submits ever decides scope. `tenant_id` on the row comes from the
 * resolved event, never the form.
 */

export type MomentCommentView = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  /** True when the reader may remove it — its writer, or the post's author. */
  removable: boolean;
};

export type MomentView = {
  id: string;
  body: string | null;
  rating: number | null;
  createdAt: Date;
  imageUrl: string | null;
  authorName: string;
  merchantName: string | null;
  merchantSlug: string | null;
  /** True when the reader is the author, so the UI can offer a delete. */
  mine: boolean;
  likes: number;
  comments: number;
  likedByViewer: boolean;
  /** Newest comment, for the feed's one-line preview. */
  latestComment: MomentCommentView | null;
};

const EMPTY_COUNTS: MomentCounts = { likes: 0, comments: 0, likedByViewer: false };

function toCommentView(
  row: CommentRow,
  postVisitorId: string,
  viewerVisitorId: string | null,
): MomentCommentView {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    authorName: row.authorName?.trim() || "Visitor",
    removable: canRemoveComment(
      { visitorId: row.visitorId, status: "published" },
      { visitorId: postVisitorId },
      viewerVisitorId ?? "",
    ),
  };
}

function toView(
  row: MomentFeedRow,
  viewerVisitorId: string | null,
  counts: MomentCounts = EMPTY_COUNTS,
  latestComment: CommentRow | null = null,
): MomentView {
  return {
    id: row.id,
    body: row.body,
    rating: row.rating,
    createdAt: row.createdAt,
    imageUrl:
      row.imageBucket && row.imagePath
        ? publicFileUrl({ bucket: row.imageBucket, path: row.imagePath })
        : null,
    authorName: row.authorName?.trim() || "Visitor",
    merchantName: row.merchantName,
    merchantSlug: row.merchantSlug,
    mine: viewerVisitorId !== null && row.visitorId === viewerVisitorId,
    likes: counts.likes,
    comments: counts.comments,
    likedByViewer: counts.likedByViewer,
    latestComment: latestComment
      ? toCommentView(latestComment, row.visitorId, viewerVisitorId)
      : null,
  };
}

type EventRef = { tenantSlug: string; eventSlug: string };

/**
 * Resolves a public event that has Moments switched on.
 *
 * A disabled feed throws `EVENT_NOT_FOUND`, not a "feature is off" message: a
 * turned-off surface must be indistinguishable from one that never existed,
 * exactly as a draft event is (§1 rule 6). Vouchers do the same.
 */
async function resolveMomentsEvent(ref: EventRef) {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) throw new AppError("EVENT_NOT_FOUND");

  const settings = await getEventSettings(event.tenantId, event.id);
  if (!settings?.enableMoments) throw new AppError("EVENT_NOT_FOUND");

  return event;
}

/** The public feed. Returns null when the event is missing or Moments are off. */
export async function listPublicFeed(
  ref: EventRef,
  viewerVisitorId: string | null,
): Promise<{ eventId: string; posts: MomentView[]; total: number } | null> {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) return null;

  const settings = await getEventSettings(event.tenantId, event.id);
  if (!settings?.enableMoments) return null;

  // Sequential: the dev/test pooler caps at one connection.
  const rows = await listPublishedPostsForEvent(event.id);
  const total = await countPublishedPostsForEvent(event.id);

  // Two queries for the whole page, not three per post — a 60-post feed would
  // otherwise be 180 round trips on a single-connection pooler.
  const ids = rows.map((r) => r.id);
  const counts = await countsForPosts(ids, viewerVisitorId);
  const latest = await latestCommentsForPosts(ids);

  return {
    eventId: event.id,
    total,
    posts: rows.map((r) =>
      toView(r, viewerVisitorId, counts.get(r.id) ?? EMPTY_COUNTS, latest.get(r.id) ?? null),
    ),
  };
}

/** One post with its full comment thread — the feed's tap-through. */
export async function getMomentDetail(
  ref: EventRef,
  postId: string,
  viewerVisitorId: string | null,
): Promise<{ post: MomentView; comments: MomentCommentView[] } | null> {
  // Shape-check before the id reaches Postgres as a uuid: a garbled URL is a
  // 404, not a driver error surfacing as a 500.
  if (!isMomentId(postId)) return null;

  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) return null;

  const settings = await getEventSettings(event.tenantId, event.id);
  if (!settings?.enableMoments) return null;

  // Scoped by event *and* published in one predicate: a hidden or deleted post
  // is a 404 here, not an explanation, so a direct link can't reveal what
  // moderation removed.
  const feedRow = await findPublishedPostForFeed(event.id, postId);
  if (!feedRow) return null;

  const counts = await countsForPosts([postId], viewerVisitorId);
  const comments = await listPublishedComments(postId);

  return {
    post: toView(feedRow, viewerVisitorId, counts.get(postId) ?? EMPTY_COUNTS, null),
    comments: comments.map((c) => toCommentView(c, feedRow.visitorId, viewerVisitorId)),
  };
}

/** The stalls a visitor may tag — the event's approved, public listings. */
export async function listTaggableStalls(
  ref: EventRef,
): Promise<Array<{ participationId: string; name: string }>> {
  const event = await resolveMomentsEvent(ref);
  const rows = await listPublicParticipations(event.id);
  return rows.map((r) => ({ participationId: r.participationId, name: r.merchantName }));
}

export type CreateMomentInput = {
  body: string | null;
  participationId: string | null;
  rating: number | null;
  photo: File | null;
};

/**
 * Creates a post. Signed-in only — the whole point of the "browse freely, sign
 * in to post" decision is that authorship is attributable.
 *
 * Posting is deliberately **not** audited: §23 records actor state-changes on
 * the organizer's own data, not visitor-generated content. The analytics log
 * carries the volume, and moderation records its own decisions.
 */
export async function createMomentPost(
  ref: EventRef,
  input: CreateMomentInput,
): Promise<{ id: string }> {
  const event = await resolveMomentsEvent(ref);

  const body = input.body?.trim() || null;
  if (body && body.length > MOMENT_BODY_MAX) {
    throw new AppError("VALIDATION_ERROR", {
      message: `Keep it under ${MOMENT_BODY_MAX} characters.`,
    });
  }

  const hasPhoto = input.photo instanceof File && input.photo.size > 0;
  if (!hasMomentContent({ body, hasImage: hasPhoto })) {
    throw new AppError("VALIDATION_ERROR", { message: "Add a photo or write something." });
  }

  // A tagged stall must genuinely belong to this event, or a visitor could
  // attach a rating to another organizer's merchant by guessing an id.
  let participationId: string | null = null;
  if (input.participationId) {
    const stalls = await listPublicParticipations(event.id);
    const match = stalls.find((s) => s.participationId === input.participationId);
    if (!match) throw new AppError("MERCHANT_NOT_FOUND", { message: "That stall isn't at this event." });
    participationId = match.participationId;
  }

  const rating = input.rating;
  if (rating !== null && !isValidRating(rating)) {
    throw new AppError("VALIDATION_ERROR", { message: "A rating is 1 to 5 stars." });
  }
  if (!isRatingAddressable({ rating, participationId })) {
    throw new AppError("VALIDATION_ERROR", { message: "Pick the stall you're rating." });
  }

  const account = await resolveSignedInVisitor();

  // The photo is uploaded before the insert because a photo-only post has no
  // other content — the `moment_posts_has_content_ck` constraint would reject a
  // two-step write. The Storage path is server-constructed from the resolved
  // event's tenant + id (§6); the client influences nothing about where it lands.
  let imageFileId: string | null = null;
  if (hasPhoto && input.photo) {
    const ctx = (await getRequestContext()) as AuthenticatedContext;
    const record = await uploadImage(ctx, {
      tenantId: event.tenantId,
      scope: `events/${event.id}/moments`,
      ownerId: account.visitor.id,
      kind: "moment_photo",
      file: input.photo,
    });
    imageFileId = record.id;
  }

  const post = await insertMomentPost({
    tenantId: event.tenantId,
    eventId: event.id,
    visitorId: account.visitor.id,
    authorUserId: account.userId,
    participationId,
    imageFileId,
    body,
    rating,
    status: "published",
  });

  const signals = await captureRequestSignals();
  await recordAnalyticsEvent({
    tenantId: event.tenantId,
    eventId: event.id,
    name: "moment_posted",
    participationId,
    visitorId: account.visitor.id,
    anonymousId: account.visitor.anonymousId,
    props: { hasPhoto: imageFileId !== null, rated: rating !== null },
    ...signals,
  });

  return { id: post.id };
}

// ---------------------------------------------------------------------------
// Likes & comments
// ---------------------------------------------------------------------------

/**
 * Resolves a post that is publicly readable under this event, or throws.
 *
 * Every like and comment goes through here, so the post id a client submits is
 * only ever a *key* — the tenant and event on the row we write come from the
 * resolved event, and a post id from another organizer's event simply isn't
 * found.
 */
async function resolveTargetPost(ref: EventRef, postId: string) {
  const event = await resolveMomentsEvent(ref);
  const post = await findMomentPostById(postId);
  if (!post || post.eventId !== event.id || !isPubliclyVisible(post.status)) {
    throw new AppError("NOT_FOUND", { message: "That post is no longer available." });
  }
  return { event, post };
}

/**
 * Likes or unlikes a post. Returns the resulting state and count so an
 * optimistic UI can settle on the truth.
 *
 * **Signed-in only.** An anonymous like would be a public number anyone could
 * inflate by clearing a cookie, and `unique(post, visitor)` only means something
 * when the visitor is an account rather than a disposable identity. Favourites
 * stay anonymous because they're private to the person; a like is a public
 * count, which is a different thing.
 */
export async function toggleMomentLike(
  ref: EventRef,
  postId: string,
  like: boolean,
): Promise<{ liked: boolean; likes: number }> {
  const { event, post } = await resolveTargetPost(ref, postId);
  const account = await resolveSignedInVisitor();

  const changed = like
    ? await insertLike({
        tenantId: event.tenantId,
        eventId: event.id,
        momentPostId: post.id,
        visitorId: account.visitor.id,
      })
    : await deleteLike(post.id, account.visitor.id);

  // Only log a *new* like. A double-tap that hits the unique constraint is the
  // same person liking the same post; counting it again would be a lie.
  if (changed && like) {
    const signals = await captureRequestSignals();
    await recordAnalyticsEvent({
      tenantId: event.tenantId,
      eventId: event.id,
      name: "moment_liked",
      participationId: post.participationId,
      visitorId: account.visitor.id,
      anonymousId: account.visitor.anonymousId,
      props: { postId: post.id },
      ...signals,
    });
  }

  return { liked: like, likes: await countLikesForPost(post.id) };
}

/** Adds a comment. Signed-in only, and live immediately like a post. */
export async function addMomentComment(
  ref: EventRef,
  postId: string,
  rawBody: string,
): Promise<{ id: string }> {
  const body = rawBody.trim();
  if (!hasCommentContent(body)) {
    throw new AppError("VALIDATION_ERROR", { message: "Write something first." });
  }
  if (body.length > MOMENT_COMMENT_MAX) {
    throw new AppError("VALIDATION_ERROR", {
      message: `Keep it under ${MOMENT_COMMENT_MAX} characters.`,
    });
  }

  const { event, post } = await resolveTargetPost(ref, postId);
  const account = await resolveSignedInVisitor();

  const comment = await insertComment({
    tenantId: event.tenantId,
    eventId: event.id,
    momentPostId: post.id,
    visitorId: account.visitor.id,
    authorUserId: account.userId,
    body,
    status: "published",
  });

  const signals = await captureRequestSignals();
  await recordAnalyticsEvent({
    tenantId: event.tenantId,
    eventId: event.id,
    name: "moment_commented",
    participationId: post.participationId,
    visitorId: account.visitor.id,
    anonymousId: account.visitor.anonymousId,
    props: { postId: post.id },
    ...signals,
  });

  return { id: comment.id };
}

/**
 * Removes a comment — by the person who wrote it, or by whoever's post it's on.
 *
 * The second case is the one worth stating: your post is your space, and waiting
 * for an organiser to hide a nasty reply is not a moderation story.
 */
export async function removeMomentComment(commentId: string): Promise<void> {
  const account = await resolveSignedInVisitor();

  const comment = await findCommentById(commentId);
  const post = comment ? await findMomentPostById(comment.momentPostId) : null;
  // Same response whether it's someone else's or doesn't exist — a visitor must
  // not be able to probe for comment ids.
  if (!comment || !post || !canRemoveComment(comment, post, account.visitor.id)) {
    throw new AppError("NOT_FOUND", { message: "That comment is no longer available." });
  }

  await markCommentDeleted(commentId);
}

/** The author removes their own post. Ownership is the `visitor_id` match. */
export async function deleteMomentPost(postId: string): Promise<void> {
  const account = await resolveSignedInVisitor();
  const removed = await deleteOwnMomentPost(postId, account.visitor.id);
  // Same response whether the post is someone else's or doesn't exist — a
  // visitor must not be able to probe for post ids.
  if (!removed) throw new AppError("NOT_FOUND", { message: "That post is no longer available." });
}

// ---------------------------------------------------------------------------
// Organiser moderation
// ---------------------------------------------------------------------------

export async function listModerationQueue(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<ModerationRow[]> {
  return listPostsForModeration(ctx.tenant.id, eventId);
}

/**
 * Hide or restore a post. Post-moderation, per the product decision: posts go
 * live immediately and the organiser takes them down, rather than a queue nobody
 * staffs at 9pm on a Saturday.
 *
 * Hiding is reversible and recorded — who, when, and why — and audited, because
 * removing someone's content is exactly the kind of decision that needs a trail.
 */
export async function setMomentModeration(
  ctx: TenantScopedContext,
  postId: string,
  action: "hide" | "restore",
  reason?: string | null,
): Promise<void> {
  const before = await findMomentPostById(postId);
  if (!before || before.tenantId !== ctx.tenant.id) {
    throw new AppError("NOT_FOUND", { message: "Post not found." });
  }
  // The author's own deletion is theirs; an organiser "restoring" it would put
  // content back that its writer took down.
  if (before.status === "deleted") {
    throw new AppError("CONFLICT", { message: "The author deleted this post." });
  }

  const hiding = action === "hide";
  const updated = await setMomentPostStatus(ctx.tenant.id, postId, {
    status: hiding ? "hidden" : "published",
    hiddenReason: hiding ? (reason?.trim() || null) : null,
    hiddenBy: hiding ? ctx.user.id : null,
    hiddenAt: hiding ? new Date() : null,
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Post not found." });

  await recordAudit(ctx, {
    action: hiding ? AUDIT_ACTIONS.MOMENT_HIDDEN : AUDIT_ACTIONS.MOMENT_RESTORED,
    resourceType: "moment_post",
    resourceId: postId,
    before: { status: before.status },
    after: { status: updated.status, reason: updated.hiddenReason },
  });
}

export async function listCommentQueue(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<CommentModerationRow[]> {
  return listCommentsForModeration(ctx.tenant.id, eventId);
}

/**
 * Hide or restore a comment. Deliberately the same shape as
 * `setMomentModeration` — a comment is visitor content on the organizer's event
 * just as a post is, and two different moderation stories for one surface is a
 * mistake waiting to happen.
 */
export async function setCommentModeration(
  ctx: TenantScopedContext,
  commentId: string,
  action: "hide" | "restore",
  reason?: string | null,
): Promise<void> {
  const before = await findCommentById(commentId);
  if (!before || before.tenantId !== ctx.tenant.id) {
    throw new AppError("NOT_FOUND", { message: "Comment not found." });
  }
  // A removal by its author (or the post's author) is theirs; an organiser
  // "restoring" it would put back words someone deliberately took down.
  if (before.status === "deleted") {
    throw new AppError("CONFLICT", { message: "This comment was deleted by its author." });
  }

  const hiding = action === "hide";
  const updated = await setCommentStatus(ctx.tenant.id, commentId, {
    status: hiding ? "hidden" : "published",
    hiddenReason: hiding ? reason?.trim() || null : null,
    hiddenBy: hiding ? ctx.user.id : null,
    hiddenAt: hiding ? new Date() : null,
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Comment not found." });

  await recordAudit(ctx, {
    action: hiding ? AUDIT_ACTIONS.MOMENT_COMMENT_HIDDEN : AUDIT_ACTIONS.MOMENT_COMMENT_RESTORED,
    resourceType: "moment_comment",
    resourceId: commentId,
    before: { status: before.status },
    after: { status: updated.status, reason: updated.hiddenReason },
  });
}

/** Average rating per stall, for the organiser's view of how stalls are landing. */
export async function stallRatings(ctx: TenantScopedContext, eventId: string) {
  return ratingSummaryForEvent(ctx.tenant.id, eventId);
}
