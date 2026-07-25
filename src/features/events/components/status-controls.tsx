"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { allowedTransitions, EVENT_STATUS_LABELS, type EventStatus } from "@/server/events/status";

import { transitionStatusAction } from "../actions";
import { initialEventFormState } from "../state";

/** Verb-first labels for the transition buttons (the badge already shows the noun). */
const LABEL: Record<EventStatus, string> = {
  draft: "Back to draft",
  setup: "Move to setup",
  merchant_onboarding: "Start merchant onboarding",
  ready_for_review: "Mark ready for review",
  published: "Publish",
  live: "Go live",
  ended: "End event",
  archived: "Archive",
  cancelled: "Cancel event",
};

const VARIANT: Partial<Record<EventStatus, "default" | "outline" | "destructive" | "secondary">> = {
  published: "default",
  live: "default",
  cancelled: "destructive",
  archived: "outline",
};

/**
 * Renders exactly the transitions legal from the current status (from the pure
 * status machine). The action re-checks legality *and* the per-transition
 * permission server-side — these buttons are convenience, never the gate.
 */
export function StatusControls({ eventId, status }: { eventId: string; status: EventStatus }) {
  const [state, submit] = useActionState(transitionStatusAction, initialEventFormState);
  const targets = allowedTransitions(status);

  return (
    <div className="grid gap-3">
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

      {targets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {EVENT_STATUS_LABELS[status]} is a final state — no further changes.
        </p>
      ) : (
        <form action={submit} className="flex flex-wrap gap-2">
          <input type="hidden" name="eventId" value={eventId} />
          {targets.map((t) => (
            <SubmitButton
              key={t}
              name="to"
              value={t}
              size="sm"
              variant={VARIANT[t] ?? "secondary"}
              pendingText="Working…"
            >
              {LABEL[t]}
            </SubmitButton>
          ))}
        </form>
      )}
    </div>
  );
}
