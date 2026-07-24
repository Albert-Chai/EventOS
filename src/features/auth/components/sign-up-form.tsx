"use client";

import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { signUpAction } from "../actions";
import { initialAuthFormState } from "../form-state";
import { FormMessage } from "./form-message";

export function SignUpForm({ next }: { next: string }) {
  const [state, submit] = useActionState(signUpAction, initialAuthFormState);

  // Once the confirmation email is sent there is nothing more to do on this
  // page; leaving the form up invites a pointless second submission.
  if (state.status === "success") {
    return <FormMessage state={state} />;
  }

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />

      <FormField
        name="displayName"
        label="Your name"
        autoComplete="name"
        required
        errors={state.fieldErrors?.displayName}
      />

      <FormField
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />

      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        errors={state.fieldErrors?.password}
      />

      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
