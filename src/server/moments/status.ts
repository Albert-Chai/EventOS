/**
 * Moments — the visitor post feed (docs/phase-10-moments-plan.md).
 *
 * Statuses and content rules live here as a closed union plus pure functions,
 * the same "code, not data" shape as permissions, audit actions, and the ad
 * slots. The repository mirrors `isPubliclyVisible` as a SQL predicate; keeping
 * the rule in one testable place is what stops the two drifting.
 */

export const MOMENT_STATUSES = ["published", "hidden", "deleted"] as const;

export type MomentStatus = (typeof MOMENT_STATUSES)[number];

const STATUS_SET = new Set<string>(MOMENT_STATUSES);

export function isMomentStatus(value: string): value is MomentStatus {
  return STATUS_SET.has(value);
}

export const MOMENT_STATUS_LABELS: Record<MomentStatus, string> = {
  published: "Live",
  hidden: "Hidden",
  deleted: "Deleted",
};

/** Longest caption we accept. Long enough for a story, short enough to scan. */
export const MOMENT_BODY_MAX = 500;

/**
 * Comments are shorter than captions on purpose: a comment is a reply, and a
 * 500-character reply in a feed is a wall.
 */
export const MOMENT_COMMENT_MAX = 300;

export const MOMENT_RATING_MIN = 1;
export const MOMENT_RATING_MAX = 5;

/**
 * What the public feed shows. `hidden` is an organiser moderation decision and
 * `deleted` is the author's own — neither is ever served, but they stay on the
 * row so moderation is reversible and accountable.
 *
 * Mirrored in SQL by `visiblePredicate()` in the repository.
 */
export function isPubliclyVisible(status: string): boolean {
  return status === "published";
}

/**
 * "Text-only posts allowed" means a caption without a photo — not an empty post.
 * A row with neither is rejected here and, independently, by a CHECK constraint.
 */
export function hasMomentContent(input: { body?: string | null; hasImage: boolean }): boolean {
  if (input.hasImage) return true;
  return typeof input.body === "string" && input.body.trim().length > 0;
}

/** A rating is 1–5 stars, whole numbers only. */
export function isValidRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MOMENT_RATING_MIN &&
    value <= MOMENT_RATING_MAX
  );
}

/**
 * A star is a judgement *about a stall*. Without a tagged stall there is nothing
 * for it to be about, so we refuse the combination rather than storing a rating
 * that can never be aggregated. Enforced again by a CHECK constraint.
 */
export function isRatingAddressable(input: {
  rating: number | null;
  participationId: string | null;
}): boolean {
  return input.rating === null || input.participationId !== null;
}

/**
 * Authors delete their own posts; nobody else's. `visitorId` is always the
 * caller's server-resolved visitor row, never a submitted value.
 */
export function canAuthorDelete(
  post: { visitorId: string; status: string },
  visitorId: string,
): boolean {
  return post.visitorId === visitorId && post.status !== "deleted";
}

/**
 * A comment can be removed by the person who wrote it **or** by whoever's post
 * it is on. The second half matters: your post is your space, and waiting for an
 * organiser to hide a nasty reply is not a moderation story.
 */
export function canRemoveComment(
  comment: { visitorId: string; status: string },
  post: { visitorId: string },
  visitorId: string,
): boolean {
  if (comment.status === "deleted") return false;
  return comment.visitorId === visitorId || post.visitorId === visitorId;
}

/** A comment is only its text, so blank is nothing at all. */
export function hasCommentContent(body: string | null | undefined): boolean {
  return typeof body === "string" && body.trim().length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards a post id taken straight from the URL.
 *
 * A hand-typed, truncated, or garbled id must never reach Postgres as a `uuid`
 * comparison: that's a driver error and a 500, when the honest answer is "no
 * such post" — and a 500 also tells an prober that their input reached the
 * database. Check the shape first and 404.
 */
export function isMomentId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Rounds a raw average to one decimal, or null when there's nothing to average. */
export function averageRating(ratings: readonly number[]): number | null {
  const usable = ratings.filter(isValidRating);
  if (usable.length === 0) return null;
  const total = usable.reduce((sum, r) => sum + r, 0);
  return Math.round((total / usable.length) * 10) / 10;
}
