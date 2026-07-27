"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  AUDIENCE_LABELS,
  AUDIENCE_TYPES,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
} from "@/server/campaigns/status";

import { createCampaignAction } from "../actions";
import { initialCampaignFormState } from "../state";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

/** Compose a campaign: channel, audience, and the message content. */
export function CampaignForm({ eventId }: { eventId: string }) {
  const [state, submit] = useActionState(createCampaignAction, initialCampaignFormState);
  const [channel, setChannel] = useState<string>("email");

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />

      {state.status === "error" && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        name="name"
        label="Campaign name"
        placeholder="Opening weekend announcement"
        required
        errors={state.fieldErrors?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="channel">Channel</Label>
          <select
            id="channel"
            name="channel"
            className={SELECT_CLASS}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            {CAMPAIGN_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CAMPAIGN_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="audienceType">Audience</Label>
          <select id="audienceType" name="audienceType" className={SELECT_CLASS} defaultValue="all_visitors">
            {AUDIENCE_TYPES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {channel === "email" ? (
        <FormField
          name="subject"
          label="Subject"
          placeholder="We open this Saturday!"
          errors={state.fieldErrors?.subject}
        />
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="body">Message</Label>
        <Textarea id="body" name="body" rows={5} required />
        {state.fieldErrors?.body ? (
          <p className="text-destructive text-xs">{state.fieldErrors.body.join(" ")}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="ctaLabel" label="Button label (optional)" placeholder="See the lineup" />
        <FormField name="ctaUrl" label="Button link (optional)" placeholder="https://…" />
      </div>

      <SubmitButton className="justify-self-start" pendingText="Creating…">
        Create campaign
      </SubmitButton>
    </form>
  );
}
