"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  actorForParticipationTransition,
  allowedParticipationTransitions,
  type ParticipationStatus,
} from "@/server/merchants/status";

import { setListingStatusAction } from "../portal-actions";
import { initialMerchantFormState } from "../state";

const LABEL: Partial<Record<ParticipationStatus, string>> = {
  submitted: "Submit for review",
  withdrawn: "Withdraw",
  draft: "Back to draft",
};

const VARIANT: Partial<Record<ParticipationStatus, "default" | "outline" | "secondary">> = {
  submitted: "default",
  withdrawn: "outline",
  draft: "secondary",
};

/**
 * The merchant's own status moves (submit / withdraw / revive) — exactly the
 * transitions the status machine marks as merchant-driven from here.
 */
export function SubmitControls({
  merchantId,
  participationId,
  status,
}: {
  merchantId: string;
  participationId: string;
  status: ParticipationStatus;
}) {
  const [state, submit] = useActionState(setListingStatusAction, initialMerchantFormState);
  const targets = allowedParticipationTransitions(status).filter(
    (t) => actorForParticipationTransition(t) === "merchant",
  );

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

      {targets.length === 0 ? null : (
        <form action={submit} className="flex flex-wrap gap-2">
          <input type="hidden" name="merchantId" value={merchantId} />
          <input type="hidden" name="participationId" value={participationId} />
          {targets.map((t) => (
            <SubmitButton
              key={t}
              name="to"
              value={t}
              size="sm"
              variant={VARIANT[t] ?? "secondary"}
              pendingText="Working…"
            >
              {LABEL[t] ?? t}
            </SubmitButton>
          ))}
        </form>
      )}
    </div>
  );
}
