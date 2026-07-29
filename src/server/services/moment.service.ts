import { AppError } from "@/lib/api/errors";
import { getRequestContext } from "@/server/auth/session";
import type { AuthenticatedContext, TenantScopedContext } from "@/server/context";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import {
  countPublishedPostsForEvent,
  deleteOwnMomentPost,
  findMomentPostById,
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
  hasMomentContent,
  isRatingAddressable,
  isValidRating,
  MOMENT_BODY_MAX,
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
};

function toView(row: MomentFeedRow, viewerVisitorId: string | null): MomentView {
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

  return { eventId: event.id, posts: rows.map((r) => toView(r, viewerVisitorId)), total };
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

/** Average rating per stall, for the organiser's view of how stalls are landing. */
export async function stallRatings(ctx: TenantScopedContext, eventId: string) {
  return ratingSummaryForEvent(ctx.tenant.id, eventId);
}
