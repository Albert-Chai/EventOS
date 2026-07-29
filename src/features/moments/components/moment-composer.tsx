"use client";

import { ChevronRight, ImagePlus, Star } from "lucide-react";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { MOMENT_BODY_MAX } from "@/server/moments/status";

import { createMomentAction } from "../actions";
import { initialMomentFormState } from "../state";

/**
 * The compose screen, shaped like a photo app's "new post": pick the picture,
 * write under it, then a stack of tappable rows for the metadata. A full page
 * rather than an inline box — on a phone a photo picker plus a stall list plus a
 * rating needs the room.
 *
 * The stars stay disabled until a stall is chosen. A star is a judgement *about
 * a stall*; the service and a CHECK constraint both refuse the combination, so
 * the UI shouldn't let you build it in the first place.
 */
export function MomentComposer({
  tenantSlug,
  eventSlug,
  stalls,
  authorName,
}: {
  tenantSlug: string;
  eventSlug: string;
  stalls: Array<{ participationId: string; name: string }>;
  authorName: string;
}) {
  const [state, submit] = useActionState(createMomentAction, initialMomentFormState);
  const [body, setBody] = useState("");
  const [participationId, setParticipationId] = useState("");
  const [rating, setRating] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const remaining = MOMENT_BODY_MAX - body.length;
  const initial = authorName.charAt(0).toUpperCase();

  return (
    // pb reserves room for the fixed Share block *and* the tab bar below it, so
    // the floating bar never lands on top of the last row.
    <form action={submit} className="pb-44">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="rating" value={rating > 0 ? String(rating) : ""} />

      {state.status === "error" && state.message ? (
        <p role="alert" className="bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.message}
        </p>
      ) : null}

      {/* Picture first — the thing the post is usually about.
          Empty, it's a compact well so the caption and options stay above the
          fold on a phone; once a photo is picked it opens to the 4:5 frame the
          feed will actually crop to, so what you see is what gets posted. */}
      <label
        htmlFor="moment-photo"
        className={`relative flex w-full cursor-pointer items-center justify-center overflow-hidden bg-[#fafafa] ${
          preview ? "aspect-[4/5]" : "h-52 border-b border-[var(--feed-line)]"
        }`}
      >
        {preview ? (
          // A local object URL of the user's own pick — next/image would want a
          // remote host configured for nothing.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="grid justify-items-center gap-1.5 px-8 text-center">
            <span aria-hidden className="moment-avatar size-12">
              <ImagePlus className="size-5" />
            </span>
            <span className="block text-sm font-bold">Add a photo</span>
            <span className="block text-xs text-[var(--feed-muted)]">
              Optional — you can post words only
            </span>
          </span>
        )}
        {preview ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white">
            Change photo
          </span>
        ) : null}
      </label>
      <input
        id="moment-photo"
        name="photo"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setPreview(file ? URL.createObjectURL(file) : null);
        }}
      />

      {/* Caption, bylined so you can see how it will read in the feed. */}
      <div className="flex gap-3 border-b border-[var(--feed-line)] px-3 py-3">
        <span aria-hidden className="moment-avatar size-8 shrink-0 text-[11px]">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor="moment-body" className="sr-only">
            Write a caption
          </label>
          <textarea
            id="moment-body"
            name="body"
            rows={3}
            maxLength={MOMENT_BODY_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a caption…"
            className="w-full resize-none bg-transparent text-sm leading-snug outline-none placeholder:text-[var(--feed-muted)]"
          />
          <span
            className={`block text-right text-[11px] ${remaining < 20 ? "text-red-600" : "text-[var(--feed-muted)]"}`}
          >
            {remaining}
          </span>
        </div>
      </div>

      {/* Tag a stall — a row, the way a photo app stacks its post options. */}
      <div className="relative border-b border-[var(--feed-line)]">
        <label htmlFor="moment-stall" className="sr-only">
          Tag a stall
        </label>
        <select
          id="moment-stall"
          name="participationId"
          value={participationId}
          onChange={(e) => {
            setParticipationId(e.target.value);
            if (!e.target.value) setRating(0);
          }}
          className="w-full appearance-none bg-transparent px-3 py-4 pr-10 text-sm font-semibold outline-none"
        >
          <option value="">Tag a stall</option>
          {stalls.map((s) => (
            <option key={s.participationId} value={s.participationId}>
              {s.name}
            </option>
          ))}
        </select>
        <ChevronRight
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-[var(--feed-muted)]"
        />
      </div>

      {/* Rate it — same row rhythm. */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--feed-line)] px-3 py-3">
        <span className="text-sm font-semibold">
          Rate it
          {!participationId ? (
            <span className="block text-[11px] font-normal text-[var(--feed-muted)]">
              Tag a stall first
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!participationId}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={rating === n}
              onClick={() => setRating(rating === n ? 0 : n)}
              className="grid size-10 place-items-center disabled:opacity-30"
            >
              <Star
                aria-hidden
                className={
                  n <= rating
                    ? "size-6 fill-amber-400 text-amber-400"
                    : "size-6 text-[var(--feed-line)]"
                }
              />
            </button>
          ))}
        </span>
      </div>

      {/* Share sits where a thumb reaches, above the tab bar. The disclaimer
          rides with it rather than at the end of the form: it says the post is
          public under your real name, which you should read *before* you tap,
          not after scrolling past a floating button. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-[470px] bg-linear-to-t from-white via-white to-transparent px-3 pt-6 pb-2">
        <p className="pb-2 text-center text-[11px] leading-snug text-[var(--feed-muted)]">
          Goes live right away, shown with your name. The organiser can remove posts.
        </p>
        <SubmitButton className="app-cta w-full py-3 text-sm shadow-lg" pendingText="Sharing…">
          Share
        </SubmitButton>
      </div>
    </form>
  );
}
