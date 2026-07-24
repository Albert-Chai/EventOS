"use client";

import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { forgotPasswordAction } from "../actions";
import { initialAuthFormState } from "../form-state";
import { FormMessage } from "./form-message";

export function ForgotPasswordForm() {
  const [state, submit] = useActionState(forgotPasswordAction, initialAuthFormState);

  if (state.status === "success") {
    return <FormMessage state={state} />;
  }

  return (
    <form action={submit} className="grid gap-4">
      <FormMessage state={state} />

      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />

      <SubmitButton className="w-full" pendingText="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}
