"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { setItemImageAction } from "../portal-actions";
import { initialMerchantFormState } from "../state";

/** Photo upload for one product (spec §8.5 item image). Editable listings only. */
export function ItemImageForm({
  merchantId,
  participationId,
  itemId,
  imageUrl,
}: {
  merchantId: string;
  participationId: string;
  itemId: string;
  imageUrl: string | null;
}) {
  const [state, submit] = useActionState(setItemImageAction, initialMerchantFormState);

  return (
    <form action={submit} className="grid gap-2">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="participationId" value={participationId} />
      <input type="hidden" name="itemId" value={itemId} />
      <ImageUploadField name="image" label="Photo" aspect="square" currentUrl={imageUrl} />
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <SubmitButton size="sm" pendingText="Saving…" className="justify-self-start">
        Save photo
      </SubmitButton>
    </form>
  );
}
