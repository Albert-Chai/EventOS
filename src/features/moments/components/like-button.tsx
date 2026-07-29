"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { toggleLikeAction } from "../actions";

/**
 * The like heart. Optimistic — the UI flips instantly and only reverts if the
 * server rejects, the same pattern as the favourite button.
 *
 * Unlike a favourite, a like needs an account: it's a public count, and one
 * anyone could inflate by clearing a cookie would be worse than no count. A
 * signed-out reader gets a link to sign-in rather than a dead control, so the
 * feed never shows a button that silently does nothing.
 */
export function LikeButton({
  postId,
  tenantSlug,
  eventSlug,
  initialLiked,
  initialCount,
  signInHref,
  canLike,
}: {
  postId: string;
  tenantSlug: string;
  eventSlug: string;
  initialLiked: boolean;
  initialCount: number;
  signInHref: string;
  canLike: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  const label = liked ? "Unlike" : "Like";
  const shell =
    "inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm font-semibold transition-colors disabled:opacity-60";

  if (!canLike) {
    return (
      <Link href={signInHref} aria-label="Sign in to like" className={cn(shell, "text-[var(--feed-ink)]")}>
        <Heart aria-hidden className="size-6" />
        {count > 0 ? <span className="tabular-nums">{count}</span> : null}
      </Link>
    );
  }

  function toggle() {
    const next = !liked;
    // Optimistic: flip the heart and nudge the count so a double-tap feels
    // instant on a phone with festival wifi.
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));

    startTransition(async () => {
      const result = await toggleLikeAction({ postId, tenantSlug, eventSlug, like: next });
      if (!result.ok) {
        setLiked(!next);
        setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        toast.error(result.message);
        return;
      }
      // Settle on the server's count — someone else may have liked it too.
      setLiked(result.liked);
      setCount(result.likes);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={label}
      className={cn(shell, liked ? "text-rose-600" : "text-[var(--feed-ink)] hover:text-rose-600")}
    >
      <Heart aria-hidden className={cn("size-6 transition-transform", liked && "scale-110 fill-current")} />
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
}
