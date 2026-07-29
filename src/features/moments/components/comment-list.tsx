import { timeAgo } from "@/lib/time-ago";
import type { MomentCommentView } from "@/server/services/moment.service";

import { removeCommentAction } from "../actions";

/**
 * A post's comment thread, oldest first — a thread reads forwards, unlike a
 * feed. A Server Component; the only control is a remove, which is a plain form.
 *
 * `removable` is decided server-side by `canRemoveComment`: the person who wrote
 * it, or whoever's post it's on. The action re-checks — this only decides
 * whether to draw the control (§14).
 */
export function CommentList({
  comments,
  tenantSlug,
  eventSlug,
}: {
  comments: MomentCommentView[];
  tenantSlug: string;
  eventSlug: string;
}) {
  if (comments.length === 0) {
    return (
      <div className="px-3 py-10 text-center">
        <p className="text-sm font-semibold">No comments yet</p>
        <p className="mt-1 text-xs text-[var(--feed-muted)]">Start the conversation.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 px-3 py-3">
      {comments.map((c) => (
        <li key={c.id} className="flex min-w-0 gap-2.5">
          <span aria-hidden className="moment-avatar size-8 shrink-0 text-[11px]">
            {c.authorName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">
              <span className="font-semibold">{c.authorName}</span>{" "}
              <span className="break-words">{c.body}</span>
            </p>
            <p className="mt-0.5 text-[11px] tracking-wide text-[var(--feed-muted)] uppercase">
              {timeAgo(c.createdAt)}
            </p>
          </div>
          {c.removable ? (
            <form action={removeCommentAction} className="shrink-0">
              <input type="hidden" name="commentId" value={c.id} />
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <input type="hidden" name="eventSlug" value={eventSlug} />
              <button
                type="submit"
                className="min-h-9 px-2 text-[11px] font-semibold text-[var(--feed-muted)] hover:text-red-600"
              >
                Remove
              </button>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
