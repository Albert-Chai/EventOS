import Link from "next/link";
import { MapPin, MoreHorizontal, Star } from "lucide-react";

import { MediaImage } from "@/components/media/media-image";
import { timeAgo } from "@/lib/time-ago";
import type { MomentView } from "@/server/services/moment.service";

import { deleteMomentAction } from "../actions";

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
}: {
  post: MomentView;
  baseHref: string;
  tenantSlug: string;
  eventSlug: string;
}) {
  const initial = post.authorName.charAt(0).toUpperCase();

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

      {/* Action row — the rating is this feed's engagement signal. */}
      {post.rating ? (
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <Stars rating={post.rating} size="md" />
          <span className="text-xs font-semibold text-[var(--feed-muted)]">
            rated {post.rating}/5
          </span>
        </div>
      ) : null}

      {/* Caption — name and text run together, the way a feed reads. */}
      {post.imageUrl && post.body ? (
        <p className="px-3 pt-2 text-sm leading-snug">
          <span className="font-semibold">{post.authorName}</span>{" "}
          <span className="whitespace-pre-line">{post.body}</span>
        </p>
      ) : null}

      <p className="px-3 pt-2 text-[11px] tracking-wide text-[var(--feed-muted)] uppercase">
        {timeAgo(post.createdAt)}
      </p>
    </li>
  );
}

/** A photo tile in the grid view. Text-only posts have nothing to show here. */
export function MomentTile({ post, feedHref }: { post: MomentView; feedHref: string }) {
  if (!post.imageUrl) return null;
  return (
    <li className="min-w-0">
      <Link
        href={`${feedHref}#m-${post.id}`}
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
        {post.rating ? (
          <span className="absolute right-1 bottom-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Star aria-hidden className="size-2.5 fill-amber-400 text-amber-400" />
            {post.rating}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
