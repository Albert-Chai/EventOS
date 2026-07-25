"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";

import { acceptMerchantInvitationAction } from "../accept-actions";
import { initialAcceptMerchantState } from "../state";

export function AcceptMerchantInvitation({ token }: { token: string }) {
  const [state, submit] = useActionState(
    acceptMerchantInvitationAction,
    initialAcceptMerchantState,
  );

  return (
    <form action={submit} className="grid gap-3">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Joining…">Accept and manage this merchant</SubmitButton>
    </form>
  );
}
