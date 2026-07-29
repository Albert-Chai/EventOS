"use client";

import { useActionState, useEffect, useRef } from "react";

import { MOMENT_COMMENT_MAX } from "@/server/moments/status";

import { addCommentAction } from "../actions";
import { initialMomentFormState } from "../state";

/**
 * The comment composer at the foot of a post. Sticky above the tab bar, so on a
 * phone you can read the thread and reply without hunting for the box.
 *
 * Clears itself on success by remounting the form — `key` on a successful state
 * is simpler and more reliable than reaching for a ref and hoping React hasn't
 * already reconciled the value away.
 */
export function CommentForm({
  postId,
  tenantSlug,
  eventSlug,
  authorInitial,
}: {
  postId: string;
  tenantSlug: string;
  eventSlug: string;
  authorInitial: string;
}) {
  const [state, submit] = useActionState(addCommentAction, initialMomentFormState);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success" && inputRef.current) inputRef.current.value = "";
  }, [state]);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-[470px] border-t border-[var(--feed-line)] bg-white">
      {state.status === "error" && state.message ? (
        <p role="alert" className="px-3 pt-2 text-xs font-semibold text-red-600">
          {state.message}
        </p>
      ) : null}
      <form action={submit} className="flex items-center gap-2 px-3 py-2">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="tenantSlug" value={tenantSlug} />
        <input type="hidden" name="eventSlug" value={eventSlug} />
        <span aria-hidden className="moment-avatar size-8 shrink-0 text-[11px]">
          {authorInitial}
        </span>
        <label htmlFor="comment-body" className="sr-only">
          Add a comment
        </label>
        <input
          id="comment-body"
          ref={inputRef}
          name="body"
          required
          maxLength={MOMENT_COMMENT_MAX}
          placeholder="Add a comment…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--feed-muted)]"
        />
        <button
          type="submit"
          className="shrink-0 px-2 py-2 text-sm font-bold text-[var(--brand)] disabled:opacity-40"
        >
          Post
        </button>
      </form>
    </div>
  );
}
