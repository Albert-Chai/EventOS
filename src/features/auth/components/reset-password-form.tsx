"use client";

import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { resetPasswordAction } from "../actions";
import { initialAuthFormState } from "../form-state";
import { FormMessage } from "./form-message";

export function ResetPasswordForm() {
  const [state, submit] = useActionState(resetPasswordAction, initialAuthFormState);

  return (
    <form action={submit} className="grid gap-4">
      <FormMessage state={state} />

      <FormField
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        errors={state.fieldErrors?.password}
      />

      <FormField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton className="w-full" pendingText="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
