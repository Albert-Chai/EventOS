import Link from "next/link";
import { Heart, MapPin, MessageCircle, MoreHorizontal, Star } from "lucide-react";

import { MediaImage } from "@/components/media/media-image";
import { timeAgo } from "@/lib/time-ago";
import type { MomentView } from "@/server/services/moment.service";

import { deleteMomentAction } from "../actions";
import { LikeButton } from "./like-button";

/**
 * One post in the feed, laid out the way a photo feed is read: who posted,
 * where, the photo at full bleed, then the caption underneath.
 *
 * A Server Component. The only interactive part is the author's own overflow
 * menu, built on `<details>` so it opens and submits without a byte of client
 * JavaScript — the delete is a plain form, as it was before.
 */

export function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const px = size === "md" ? "size-[18px]" : "size-3.5";
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={
            n <= rating ? `${px} fill-amber-400 text-amber-400` : `${px} text-[var(--feed-line)]`
          }
        />
      ))}
    </span>
  );
}

export function MomentCard({
  post,
  baseHref,
  tenantSlug,
  eventSlug,
  canInteract,
  signInHref,
  showComments = true,
}: {
  post: MomentView;
  baseHref: string;
  tenantSlug: string;
  eventSlug: string;
  /** Whether the reader is signed in — liking and commenting need an account. */
  canInteract: boolean;
  signInHref: string;
  /** False on the post's own page, where the thread is rendered below. */
  showComments?: boolean;
}) {
  const initial = post.authorName.charAt(0).toUpperCase();
  const postHref = `${baseHref}/moments/${post.id}`;

  return (
    <li id={`m-${post.id}`} className="min-w-0 scroll-mt-24 border-b border-[var(--feed-line)] pb-3 last:border-0">
      {/* Header — avatar, name, and the tagged stall as the location line */}
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
        <span aria-hidden className="moment-avatar size-8 shrink-0 text-[11px]">
          {initial}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold">{post.authorName}</span>
          {post.merchantSlug ? (
            <Link
              href={`${baseHref}/${post.merchantSlug}`}
              className="flex min-w-0 items-center gap-0.5 text-xs text-[var(--feed-muted)] hover:underline"
            >
              <MapPin aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{post.merchantName}</span>
            </Link>
          ) : null}
        </span>

        {post.mine ? (
          <details className="relative shrink-0">
            <summary
              className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-[var(--feed-ink)] hover:bg-black/5 [&::-webkit-details-marker]:hidden"
              aria-label="Post options"
            >
              <MoreHorizontal aria-hidden className="size-5" />
            </summary>
            <div className="absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-[var(--feed-line)] bg-white shadow-lg">
              <form action={deleteMomentAction}>
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="tenantSlug" value={tenantSlug} />
                <input type="hidden" name="eventSlug" value={eventSlug} />
                <button
                  type="submit"
                  className="block w-full px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete post
                </button>
              </form>
            </div>
          </details>
        ) : null}
      </div>

      {/* Media — full bleed, cropped to a portrait frame so the column doesn't
          jump between posts of different shapes. */}
      {post.imageUrl ? (
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
          <MediaImage
            src={post.imageUrl}
            alt={post.body ?? `A moment shared by ${post.authorName}`}
            width={1080}
            height={1350}
            rounded="none"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : (
        // A text-only post still needs presence in a photo feed, so it gets a
        // typographic frame of the same weight rather than a bare paragraph.
        <blockquote className="moment-quote flex min-h-44 items-center px-6 py-10">
          <p className="text-xl leading-snug font-semibold tracking-tight text-balance">
            {post.body}
          </p>
        </blockquote>
      )}

      {/* Action row — like, comment, and the stall rating side by side. */}
      <div className="flex items-center gap-3 px-2.5 pt-2">
        <LikeButton
          postId={post.id}
          tenantSlug={tenantSlug}
          eventSlug={eventSlug}
          initialLiked={post.likedByViewer}
          initialCount={post.likes}
          canLike={canInteract}
          signInHref={signInHref}
        />
        <Link
          href={postHref}
          aria-label={`Comment on ${post.authorName}'s moment`}
          className="inline-flex items-center gap-1.5 px-1 py-1 text-sm font-semibold hover:text-[var(--brand)]"
        >
          <MessageCircle aria-hidden className="size-6 -scale-x-100" />
          {post.comments > 0 ? <span className="tabular-nums">{post.comments}</span> : null}
        </Link>
        {post.rating ? (
          <span className="ml-auto flex items-center gap-1.5 pr-1">
            <Stars rating={post.rating} />
          </span>
        ) : null}
      </div>

      {/* Caption — name and text run together, the way a feed reads. */}
      {post.imageUrl && post.body ? (
        <p className="px-3 pt-2 text-sm leading-snug">
          <span className="font-semibold">{post.authorName}</span>{" "}
          <span className="whitespace-pre-line">{post.body}</span>
        </p>
      ) : null}

      {/* Suppressed on the post's own page, where the full thread is right
          below — a "view all comments" link above the comments is noise. */}
      {showComments && post.comments > 0 ? (
        <div className="grid gap-1 px-3 pt-1.5">
          {post.comments > 1 ? (
            <Link href={postHref} className="text-sm text-[var(--feed-muted)] hover:underline">
              View all {post.comments} comments
            </Link>
          ) : null}
          {post.latestComment ? (
            <p className="text-sm leading-snug">
              <span className="font-semibold">{post.latestComment.authorName}</span>{" "}
              <span>{post.latestComment.body}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {showComments ? (
        <Link
          href={postHref}
          className="block px-3 pt-2 text-[11px] tracking-wide text-[var(--feed-muted)] uppercase hover:underline"
        >
          {timeAgo(post.createdAt)}
        </Link>
      ) : (
        <p className="px-3 pt-2 text-[11px] tracking-wide text-[var(--feed-muted)] uppercase">
          {timeAgo(post.createdAt)}
        </p>
      )}
    </li>
  );
}

/** A photo tile in the grid view. Text-only posts have nothing to show here. */
export function MomentTile({ post, baseHref }: { post: MomentView; baseHref: string }) {
  if (!post.imageUrl) return null;
  return (
    <li className="min-w-0">
      <Link
        href={`${baseHref}/moments/${post.id}`}
        className="relative block aspect-square w-full overflow-hidden bg-black"
      >
        <MediaImage
          src={post.imageUrl}
          alt={post.body ?? `A moment shared by ${post.authorName}`}
          width={400}
          height={400}
          rounded="none"
          className="absolute inset-0 h-full w-full object-cover transition-opacity hover:opacity-90"
        />
        <span className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
          {post.rating ? (
            <span className="flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Star aria-hidden className="size-2.5 fill-amber-400 text-amber-400" />
              {post.rating}
            </span>
          ) : (
            <span />
          )}
          {post.likes > 0 || post.comments > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {post.likes > 0 ? (
                <span className="flex items-center gap-0.5">
                  <Heart aria-hidden className="size-2.5 fill-current" />
                  {post.likes}
                </span>
              ) : null}
              {post.comments > 0 ? (
                <span className="flex items-center gap-0.5">
                  <MessageCircle aria-hidden className="size-2.5" />
                  {post.comments}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
