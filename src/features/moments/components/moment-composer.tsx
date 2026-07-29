"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { MOMENT_BODY_MAX } from "@/server/moments/status";

import { createMomentAction } from "../actions";
import { initialMomentFormState } from "../state";

/**
 * The compose screen. A full page rather than an inline box: on a phone, a photo
 * picker plus a stall search plus a rating needs the room.
 *
 * The star rating stays disabled until a stall is chosen — a star is a judgement
 * *about a stall*, and the service and a CHECK constraint both refuse the
 * combination, so the UI shouldn't let you build it in the first place.
 */
export function MomentComposer({
  tenantSlug,
  eventSlug,
  stalls,
}: {
  tenantSlug: string;
  eventSlug: string;
  stalls: Array<{ participationId: string; name: string }>;
}) {
  const [state, submit] = useActionState(createMomentAction, initialMomentFormState);
  const [body, setBody] = useState("");
  const [participationId, setParticipationId] = useState("");
  const [rating, setRating] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const remaining = MOMENT_BODY_MAX - body.length;

  return (
    <form action={submit} className="grid gap-5">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="rating" value={rating > 0 ? String(rating) : ""} />

      {state.status === "error" && state.message ? (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {state.message}
        </p>
      ) : null}

      {/* Photo */}
      <div className="grid gap-2">
        <label htmlFor="moment-photo" className="app-eyebrow">
          Photo
        </label>
        <label
          htmlFor="moment-photo"
          className="app-card grid min-h-40 cursor-pointer place-items-center overflow-hidden p-0 text-center"
        >
          {preview ? (
            // A local object URL of the user's own pick — next/image would want a
            // configured remote host for nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full max-h-72 w-full object-cover" />
          ) : (
            <span className="px-6 py-10">
              <span className="text-foreground block text-sm font-bold">Add a photo</span>
              <span className="mt-1 block text-xs text-[var(--app-muted)]">
                Optional — you can post words only
              </span>
            </span>
          )}
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
      </div>

      {/* Caption */}
      <div className="grid gap-2">
        <label htmlFor="moment-body" className="app-eyebrow">
          What happened?
        </label>
        <textarea
          id="moment-body"
          name="body"
          rows={4}
          maxLength={MOMENT_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Best char kuey teow of the weekend…"
          className="border-input bg-background focus:border-[var(--brand)] w-full rounded-xl border p-3 text-sm outline-none"
        />
        <span
          className={`justify-self-end text-xs ${remaining < 20 ? "text-red-600" : "text-[var(--app-muted)]"}`}
        >
          {remaining} left
        </span>
      </div>

      {/* Stall + rating */}
      <div className="grid gap-2">
        <label htmlFor="moment-stall" className="app-eyebrow">
          Which stall?
        </label>
        <select
          id="moment-stall"
          name="participationId"
          value={participationId}
          onChange={(e) => {
            setParticipationId(e.target.value);
            if (!e.target.value) setRating(0);
          }}
          className="border-input bg-background focus:border-[var(--brand)] h-11 w-full rounded-xl border px-3 text-sm outline-none"
        >
          <option value="">No stall — just the event</option>
          {stalls.map((s) => (
            <option key={s.participationId} value={s.participationId}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="mt-1 flex items-center gap-3">
          <span className="text-xs font-semibold text-[var(--app-muted)]">Rate it</span>
          <span className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={!participationId}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                aria-pressed={rating === n}
                onClick={() => setRating(rating === n ? 0 : n)}
                className="grid size-9 place-items-center disabled:opacity-40"
              >
                <Star
                  aria-hidden
                  className={
                    n <= rating
                      ? "size-6 fill-amber-400 text-amber-400"
                      : "size-6 text-[var(--app-line)]"
                  }
                />
              </button>
            ))}
          </span>
        </div>
        {!participationId ? (
          <p className="text-xs text-[var(--app-muted)]">Pick a stall to rate it.</p>
        ) : null}
      </div>

      <SubmitButton className="app-cta w-full" pendingText="Posting…">
        Post moment
      </SubmitButton>
      <p className="text-center text-xs text-[var(--app-muted)]">
        Your post goes live right away and shows your name. The organiser can remove posts that
        break the rules.
      </p>
    </form>
  );
}
