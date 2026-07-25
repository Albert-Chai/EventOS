"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";

import { acceptInvitationAction } from "../accept-actions";
import { initialAcceptState } from "../state";

export function AcceptInvitation({ token }: { token: string }) {
  const [state, submit] = useActionState(acceptInvitationAction, initialAcceptState);

  return (
    <form action={submit} className="grid gap-4">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton className="w-full" pendingText="Joining…">
        Accept invitation
      </SubmitButton>
    </form>
  );
}
