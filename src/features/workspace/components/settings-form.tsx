"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { updateWorkspaceAction } from "../actions";
import { initialWorkspaceSettingsState } from "../state";

export function WorkspaceSettingsForm({
  defaults,
}: {
  defaults: { name: string; contactEmail: string; contactPhone: string };
}) {
  const [state, submit] = useActionState(updateWorkspaceAction, initialWorkspaceSettingsState);

  return (
    <form action={submit} className="grid max-w-md gap-4">
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

      <FormField name="name" label="Workspace name" required defaultValue={defaults.name} />
      <FormField
        name="contactEmail"
        label="Contact email"
        type="email"
        defaultValue={defaults.contactEmail}
      />
      <FormField name="contactPhone" label="Contact phone" defaultValue={defaults.contactPhone} />

      <SubmitButton className="justify-self-start" pendingText="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
