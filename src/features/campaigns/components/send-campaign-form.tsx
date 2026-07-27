"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";

import { sendCampaignAction } from "../actions";
import { initialCampaignFormState } from "../state";

/**
 * Sends a campaign. The status machine makes `sent` terminal, so a double-click
 * (or a re-submitted form) is rejected server-side rather than sending twice.
 */
export function SendCampaignForm({
  campaignId,
  disabled,
  recipientCount,
}: {
  campaignId: string;
  disabled: boolean;
  recipientCount: number;
}) {
  const [state, submit] = useActionState(sendCampaignAction, initialCampaignFormState);

  return (
    <div className="grid gap-2">
      <form action={submit}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <SubmitButton size="sm" variant="outline" disabled={disabled} pendingText="Sending…">
          Send to {recipientCount} {recipientCount === 1 ? "visitor" : "visitors"}
        </SubmitButton>
      </form>
      {state.status !== "idle" && state.message ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
