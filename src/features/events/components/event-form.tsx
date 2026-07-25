"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_VISIBILITIES } from "@/server/events/event-types";

import { createEventAction, updateEventAction } from "../actions";
import { initialEventFormState } from "../state";

/** All values as strings, formatted by the (server) page — keeps this client
 * component free of any `Date` formatting, so there is no hydration mismatch. */
export type EventFormValues = {
  name: string;
  slug: string;
  eventType: string;
  visibility: string;
  shortDescription: string;
  description: string;
  venueName: string;
  venueAddress: string;
  timezone: string;
  startAt: string;
  endAt: string;
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public — listed and shareable",
  unlisted: "Unlisted — shareable by link only",
  private: "Private — organizer only",
};

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export function EventForm({
  mode,
  eventId,
  defaults,
}: {
  mode: "create" | "edit";
  eventId?: string;
  defaults: EventFormValues;
}) {
  const action = mode === "create" ? createEventAction : updateEventAction;
  const [state, submit] = useActionState(action, initialEventFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="grid gap-5">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" && state.message ? (
        <Alert role="status">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "edit" && eventId ? <input type="hidden" name="eventId" value={eventId} /> : null}

      <FormField
        name="name"
        label="Event name"
        required
        defaultValue={defaults.name}
        errors={fieldErrors.name}
        placeholder="KL Street Eats Weekend"
      />

      <FormField
        name="slug"
        label="Slug"
        hint="Lowercase letters, numbers, hyphens. Auto-generated from the name if blank. The public URL is /{workspace}/{slug}."
        defaultValue={defaults.slug}
        errors={fieldErrors.slug}
        placeholder="street-eats"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="eventType">Event type</Label>
          <select
            id="eventType"
            name="eventType"
            defaultValue={defaults.eventType || "other"}
            className={SELECT_CLASS}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={defaults.visibility || "public"}
            className={SELECT_CLASS}
          >
            {EVENT_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="startAt"
          label="Starts"
          type="datetime-local"
          defaultValue={defaults.startAt}
          errors={fieldErrors.startAt}
        />
        <FormField
          name="endAt"
          label="Ends"
          type="datetime-local"
          defaultValue={defaults.endAt}
          errors={fieldErrors.endAt}
        />
      </div>

      <FormField
        name="timezone"
        label="Timezone"
        hint="IANA name, e.g. Asia/Kuala_Lumpur."
        defaultValue={defaults.timezone}
        errors={fieldErrors.timezone}
        placeholder="Asia/Kuala_Lumpur"
      />

      <FormField
        name="venueName"
        label="Venue name"
        defaultValue={defaults.venueName}
        errors={fieldErrors.venueName}
        placeholder="Central Market"
      />
      <FormField
        name="venueAddress"
        label="Venue address"
        defaultValue={defaults.venueAddress}
        errors={fieldErrors.venueAddress}
        placeholder="Jalan Hang Kasturi, 50050 Kuala Lumpur"
      />

      <div className="grid gap-2">
        <Label htmlFor="shortDescription">Short description</Label>
        <Textarea
          id="shortDescription"
          name="shortDescription"
          rows={2}
          defaultValue={defaults.shortDescription}
          placeholder="One line shown on cards and previews."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Full description</Label>
        <Textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={defaults.description}
          placeholder="What visitors can expect — highlights, who it's for, what's on."
        />
      </div>

      <SubmitButton className="justify-self-start" pendingText="Saving…">
        {mode === "create" ? "Create event" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
