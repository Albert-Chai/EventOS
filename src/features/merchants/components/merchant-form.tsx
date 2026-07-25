"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createMerchantAction, updateMerchantAction } from "../actions";
import { initialMerchantFormState } from "../state";

export type MerchantFormValues = {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
};

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export function MerchantForm({
  mode,
  merchantId,
  defaults,
  categories,
}: {
  mode: "create" | "edit";
  merchantId?: string;
  defaults: MerchantFormValues;
  categories: { id: string; name: string }[];
}) {
  const action = mode === "create" ? createMerchantAction : updateMerchantAction;
  const [state, submit] = useActionState(action, initialMerchantFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="grid gap-5">
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

      {mode === "edit" && merchantId ? (
        <input type="hidden" name="merchantId" value={merchantId} />
      ) : null}

      <FormField
        name="name"
        label="Merchant name"
        required
        defaultValue={defaults.name}
        errors={fieldErrors.name}
        placeholder="Nasi Lemak Bangsar"
      />
      <FormField
        name="slug"
        label="Slug"
        hint="Lowercase letters, numbers, hyphens. Auto-generated from the name if blank."
        defaultValue={defaults.slug}
        errors={fieldErrors.slug}
        placeholder="nasi-lemak-bangsar"
      />

      <div className="grid gap-2">
        <Label htmlFor="categoryId">Category</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={defaults.categoryId}
          className={SELECT_CLASS}
        >
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults.description}
          placeholder="What this merchant offers."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="contactName"
          label="Contact name"
          defaultValue={defaults.contactName}
          errors={fieldErrors.contactName}
        />
        <FormField
          name="contactEmail"
          label="Contact email"
          type="email"
          hint="Where the claim invitation is sent."
          defaultValue={defaults.contactEmail}
          errors={fieldErrors.contactEmail}
        />
        <FormField
          name="contactPhone"
          label="Contact phone"
          defaultValue={defaults.contactPhone}
          errors={fieldErrors.contactPhone}
        />
        <FormField
          name="website"
          label="Website"
          defaultValue={defaults.website}
          errors={fieldErrors.website}
          placeholder="https://…"
        />
      </div>

      <SubmitButton className="justify-self-start" pendingText="Saving…">
        {mode === "create" ? "Create merchant" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
