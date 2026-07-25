"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createCategoryAction } from "../actions";
import { initialMerchantFormState } from "../state";

export function CategoryForm() {
  const [state, submit] = useActionState(createCategoryAction, initialMerchantFormState);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <FormField
        name="name"
        label="New category"
        required
        className="min-w-48 flex-1"
        placeholder="Street food"
      />
      <SubmitButton size="sm" pendingText="Adding…">
        Add
      </SubmitButton>
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert" className="w-full">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" && state.message ? (
        <Alert role="status" className="w-full">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
