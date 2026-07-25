"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { updateListingAction } from "../portal-actions";
import { initialMerchantFormState } from "../state";

export function ListingForm({
  merchantId,
  participationId,
  listingTitle,
  listingDescription,
  disabled,
}: {
  merchantId: string;
  participationId: string;
  listingTitle: string;
  listingDescription: string;
  disabled?: boolean;
}) {
  const [state, submit] = useActionState(updateListingAction, initialMerchantFormState);

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

      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="participationId" value={participationId} />

      <FormField
        name="listingTitle"
        label="Listing title"
        defaultValue={listingTitle}
        disabled={disabled}
        hint="Shown as the heading of your public listing for this event."
      />
      <div className="grid gap-2">
        <Label htmlFor="listingDescription">Listing description</Label>
        <Textarea
          id="listingDescription"
          name="listingDescription"
          rows={5}
          defaultValue={listingDescription}
          disabled={disabled}
          placeholder="Tell visitors what you're bringing to this event."
        />
      </div>

      {!disabled ? (
        <SubmitButton className="justify-self-start" pendingText="Saving…">
          Save listing
        </SubmitButton>
      ) : null}
    </form>
  );
}
