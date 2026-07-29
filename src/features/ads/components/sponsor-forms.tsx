"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/forms/submit-button";
import { AD_SLOTS, AD_SLOT_DESCRIPTIONS, AD_SLOT_LABELS } from "@/server/ads/slots";

import { createBookingAction, createSponsorAction } from "../dashboard-actions";
import { initialAdFormState } from "../state";

const field =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm outline-none focus:border-[var(--primary)]";
const label = "text-muted-foreground text-xs font-semibold";

function Message({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={
        state.status === "error"
          ? "text-destructive text-sm"
          : "text-sm font-medium text-emerald-600"
      }
      role="status"
    >
      {state.message}
    </p>
  );
}

/** Add an advertiser to this workspace. */
export function SponsorForm() {
  const [state, submit] = useActionState(createSponsorAction, initialAdFormState);

  return (
    <form action={submit} className="grid gap-3">
      <div className="grid gap-1">
        <label className={label} htmlFor="sponsor-name">
          Sponsor name
        </label>
        <input id="sponsor-name" name="name" required className={field} placeholder="Acme Bank" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className={label} htmlFor="sponsor-website">
            Website
          </label>
          <input
            id="sponsor-website"
            name="websiteUrl"
            type="url"
            className={field}
            placeholder="https://acme.example"
          />
        </div>
        <div className="grid gap-1">
          <label className={label} htmlFor="sponsor-email">
            Contact email
          </label>
          <input id="sponsor-email" name="contactEmail" type="email" className={field} />
        </div>
      </div>
      <Message state={state} />
      <SubmitButton className="w-fit">Add sponsor</SubmitButton>
    </form>
  );
}

/** Book a sponsor into a slot for a date range, with its creative. */
export function BookingForm({
  eventId,
  sponsors,
}: {
  eventId: string;
  sponsors: Array<{ id: string; name: string }>;
}) {
  const [state, submit] = useActionState(createBookingAction, initialAdFormState);

  if (sponsors.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add a sponsor first — a booking needs someone to belong to.
      </p>
    );
  }

  return (
    <form action={submit} className="grid gap-3">
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-sponsor">
            Sponsor
          </label>
          <select id="booking-sponsor" name="sponsorId" required className={field}>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-slot">
            Slot
          </label>
          <select id="booking-slot" name="slot" required className={field} defaultValue="event_landing">
            {AD_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {AD_SLOT_LABELS[slot]} — {AD_SLOT_DESCRIPTIONS[slot]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1">
        <label className={label} htmlFor="booking-creative">
          Creative image
        </label>
        <input
          id="booking-creative"
          name="creative"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="text-sm"
        />
        <p className="text-muted-foreground text-xs">
          A wide banner works best (about 1200×400). A booking can&apos;t go live without one.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-url">
            Click-through URL
          </label>
          <input
            id="booking-url"
            name="clickUrl"
            type="url"
            className={field}
            placeholder="https://acme.example/festival"
          />
        </div>
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-alt">
            Alt text
          </label>
          <input
            id="booking-alt"
            name="altText"
            className={field}
            placeholder="Acme Bank — 10% cashback"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-start">
            Starts
          </label>
          <input id="booking-start" name="startsDate" type="date" className={field} />
        </div>
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-end">
            Ends
          </label>
          <input id="booking-end" name="endsDate" type="date" className={field} />
        </div>
        <div className="grid gap-1">
          <label className={label} htmlFor="booking-weight">
            Rotation weight
          </label>
          <input
            id="booking-weight"
            name="weight"
            type="number"
            min={1}
            defaultValue={1}
            className={field}
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Leave the dates empty to run open-ended. When several bookings share a slot, a higher
        weight is served more often.
      </p>

      <Message state={state} />
      <SubmitButton className="w-fit">Create booking</SubmitButton>
    </form>
  );
}
