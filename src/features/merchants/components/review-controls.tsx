"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { PARTICIPATION_STATUS_LABELS, type ParticipationStatus } from "@/server/merchants/status";

import { reviewParticipationAction } from "../actions";
import { initialMerchantFormState } from "../state";

/**
 * Organizer review verdicts, shown only when a listing is awaiting review. The
 * action re-checks the permission and the transition legality server-side.
 */
export function ReviewControls({
  participationId,
  eventId,
  status,
}: {
  participationId: string;
  eventId: string;
  status: ParticipationStatus;
}) {
  const [state, submit] = useActionState(reviewParticipationAction, initialMerchantFormState);

  return (
    <div className="grid gap-2">
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

      {status === "submitted" ? (
        <form action={submit} className="grid gap-2">
          <input type="hidden" name="participationId" value={participationId} />
          <input type="hidden" name="eventId" value={eventId} />
          <Textarea
            name="note"
            rows={2}
            placeholder="Optional note — shown to the merchant if you request changes or reject."
          />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="to" value="approved" size="sm" pendingText="Working…">
              Approve
            </SubmitButton>
            <SubmitButton
              name="to"
              value="changes_requested"
              size="sm"
              variant="secondary"
              pendingText="Working…"
            >
              Request changes
            </SubmitButton>
            <SubmitButton
              name="to"
              value="rejected"
              size="sm"
              variant="destructive"
              pendingText="Working…"
            >
              Reject
            </SubmitButton>
          </div>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">
          {PARTICIPATION_STATUS_LABELS[status]} — no review action right now.
        </p>
      )}
    </div>
  );
}
