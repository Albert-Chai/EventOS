"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { grantAdminAction } from "../actions";
import { initialPlatformActionState } from "../state";

export function GrantAdminForm() {
  const [state, submit] = useActionState(grantAdminAction, initialPlatformActionState);

  return (
    <form action={submit} className="grid gap-4">
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

      <FormField
        name="email"
        label="Email address"
        type="email"
        required
        hint="They must already have an EventOS account."
        placeholder="admin@eventos.my"
      />
      <FormField name="note" label="Note (optional)" placeholder="Why they need access" />

      <SubmitButton className="justify-self-start" pendingText="Granting…">
        Grant platform admin
      </SubmitButton>
    </form>
  );
}
