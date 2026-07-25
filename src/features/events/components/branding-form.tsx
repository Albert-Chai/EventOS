"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { EVENT_THEMES, type EventBranding } from "@/server/db/schema";

import { updateBrandingAction } from "../actions";
import { initialEventFormState } from "../state";

const THEME_LABELS: Record<string, string> = {
  classic: "Classic",
  vibrant: "Vibrant",
  minimal: "Minimal",
  night: "Night",
};

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export function BrandingForm({
  eventId,
  branding,
  logoUrl,
  coverUrl,
}: {
  eventId: string;
  branding: EventBranding;
  logoUrl: string | null;
  coverUrl: string | null;
}) {
  const [state, submit] = useActionState(updateBrandingAction, initialEventFormState);
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

      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-2">
        <Label htmlFor="theme">Theme</Label>
        <select id="theme" name="theme" defaultValue={branding.theme} className={SELECT_CLASS}>
          {EVENT_THEMES.map((t) => (
            <option key={t} value={t}>
              {THEME_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="primaryColor">Primary colour</Label>
        <div className="flex items-center gap-3">
          <input
            id="primaryColor"
            name="primaryColor"
            type="color"
            defaultValue={branding.primaryColor}
            className="border-input h-9 w-14 cursor-pointer rounded-lg border bg-transparent"
          />
          <span className="text-muted-foreground text-xs">
            Used for buttons and highlights on the public page.
          </span>
        </div>
        {fieldErrors.primaryColor ? (
          <p className="text-destructive text-xs">{fieldErrors.primaryColor.join(" ")}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="secondaryColor"
          label="Secondary colour (optional)"
          defaultValue={branding.secondaryColor ?? ""}
          errors={fieldErrors.secondaryColor}
          placeholder="#64748b"
        />
        <FormField
          name="accentColor"
          label="Accent colour (optional)"
          defaultValue={branding.accentColor ?? ""}
          errors={fieldErrors.accentColor}
          placeholder="#f97316"
        />
      </div>

      <ImageUploadField
        name="logo"
        label="Logo"
        aspect="square"
        currentUrl={logoUrl}
        hint="Shown on the public event header. PNG, JPEG, WebP or AVIF, up to 6 MB."
      />
      <ImageUploadField
        name="cover"
        label="Cover image"
        aspect="wide"
        currentUrl={coverUrl}
        hint="A wide banner for the top of the public page."
      />

      <SubmitButton className="justify-self-start" pendingText="Saving…">
        Save branding
      </SubmitButton>
    </form>
  );
}
