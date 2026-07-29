import Link from "next/link";
import { Star } from "lucide-react";

import { MediaImage } from "@/components/media/media-image";
import { timeAgo } from "@/lib/time-ago";
import type { MomentView } from "@/server/services/moment.service";

import { deleteMomentAction } from "../actions";

/**
 * One post in the feed. A Server Component — nothing here is interactive except
 * the author's delete, which is a plain form so it works before hydration.
 */

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={
            n <= rating
              ? "size-3.5 fill-amber-400 text-amber-400"
              : "size-3.5 text-[var(--app-line)]"
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
    <li className="app-card min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2.5 px-3 pt-3">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-[var(--brand-ink)]"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm font-bold">
            {post.authorName}
          </span>
          <span className="text-[var(--app-muted)] block text-xs">{timeAgo(post.createdAt)}</span>
        </span>
        {post.mine ? (
          <form action={deleteMomentAction}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="tenantSlug" value={tenantSlug} />
            <input type="hidden" name="eventSlug" value={eventSlug} />
            <button
              type="submit"
              className="min-h-9 shrink-0 px-2 text-xs font-semibold text-[var(--app-muted)] hover:text-red-600"
            >
              Delete
            </button>
          </form>
        ) : null}
      </div>

      {post.imageUrl ? (
        <div className="mt-3">
          <MediaImage
            src={post.imageUrl}
            alt={post.body ?? `A moment shared by ${post.authorName}`}
            width={1080}
            height={1080}
            rounded="none"
            className="h-auto w-full"
          />
        </div>
      ) : null}

      <div className="grid gap-2 px-3 pt-3 pb-3">
        {post.merchantSlug ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href={`${baseHref}/${post.merchantSlug}`}
              className="app-pill min-w-0 truncate text-xs font-semibold"
            >
              {post.merchantName}
            </Link>
            {post.rating ? <Stars rating={post.rating} /> : null}
          </span>
        ) : null}
        {post.body ? (
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
        ) : null}
      </div>
    </li>
  );
}
