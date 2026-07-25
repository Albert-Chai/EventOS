"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { setMerchantImageAction } from "../portal-actions";
import { initialMerchantFormState } from "../state";

/**
 * Merchant logo + cover upload for the portal (spec §18 "mobile-friendly image
 * upload"). Two independent forms so a slow cover upload never blocks the logo.
 */
export function MerchantBrandForm({
  merchantId,
  logoUrl,
  coverUrl,
}: {
  merchantId: string;
  logoUrl: string | null;
  coverUrl: string | null;
}) {
  return (
    <div className="grid gap-6">
      <BrandImageForm
        merchantId={merchantId}
        kind="logo"
        label="Logo"
        aspect="square"
        currentUrl={logoUrl}
        hint="Square works best. PNG, JPEG, WebP or AVIF, up to 6 MB."
      />
      <BrandImageForm
        merchantId={merchantId}
        kind="cover"
        label="Cover image"
        aspect="wide"
        currentUrl={coverUrl}
        hint="A wide banner shown on your public page."
      />
    </div>
  );
}

function BrandImageForm({
  merchantId,
  kind,
  label,
  aspect,
  currentUrl,
  hint,
}: {
  merchantId: string;
  kind: "logo" | "cover";
  label: string;
  aspect: "square" | "wide";
  currentUrl: string | null;
  hint: string;
}) {
  const [state, submit] = useActionState(setMerchantImageAction, initialMerchantFormState);

  return (
    <form action={submit} className="grid gap-3">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="kind" value={kind} />
      <ImageUploadField
        name={kind}
        label={label}
        aspect={aspect}
        currentUrl={currentUrl}
        hint={hint}
      />
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
      <SubmitButton size="sm" pendingText="Saving…" className="justify-self-start">
        Save {label.toLowerCase()}
      </SubmitButton>
    </form>
  );
}
