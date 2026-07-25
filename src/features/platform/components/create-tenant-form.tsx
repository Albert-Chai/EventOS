"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createTenantAction } from "../actions";
import { initialPlatformActionState } from "../state";

export function CreateTenantForm() {
  const [state, submit] = useActionState(createTenantAction, initialPlatformActionState);

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
        name="name"
        label="Workspace name"
        required
        placeholder="Kuala Lumpur Food Festival"
      />
      <FormField
        name="slug"
        label="Slug (optional)"
        hint="Lowercase letters, numbers, and hyphens. Auto-generated from the name if blank."
        placeholder="kl-food-festival"
      />
      <FormField
        name="ownerEmail"
        label="Owner email"
        type="email"
        required
        hint="If they already have an account they become the owner immediately; otherwise invite them from the workspace."
        placeholder="owner@example.com"
      />

      <SubmitButton className="justify-self-start" pendingText="Creating…">
        Create workspace
      </SubmitButton>
    </form>
  );
}
