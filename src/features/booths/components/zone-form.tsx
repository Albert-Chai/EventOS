"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createZoneAction, updateZoneAction } from "../actions";
import { initialBoothFormState } from "../state";

export function ZoneForm({
  eventId,
  mode,
  zone,
}: {
  eventId: string;
  mode: "create" | "edit";
  zone?: { id: string; name: string; description: string | null; color: string | null };
}) {
  const action = mode === "create" ? createZoneAction : updateZoneAction;
  const [state, submit] = useActionState(action, initialBoothFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      {mode === "edit" && zone ? <input type="hidden" name="zoneId" value={zone.id} /> : null}

      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <FormField
          name="name"
          label="Zone name"
          required
          defaultValue={zone?.name}
          errors={fieldErrors.name}
          placeholder="Food Court"
        />
        <div className="grid gap-2">
          <Label htmlFor={`color-${zone?.id ?? "new"}`}>Colour</Label>
          <input
            id={`color-${zone?.id ?? "new"}`}
            name="color"
            type="color"
            defaultValue={zone?.color ?? "#2563eb"}
            className="border-input h-9 w-16 rounded-lg border bg-transparent"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`zone-desc-${zone?.id ?? "new"}`}>Description</Label>
        <Textarea
          id={`zone-desc-${zone?.id ?? "new"}`}
          name="description"
          rows={2}
          defaultValue={zone?.description ?? ""}
          placeholder="Optional — shown on the public map legend."
        />
      </div>

      <SubmitButton size="sm" pendingText="Saving…" className="justify-self-start">
        {mode === "create" ? "Add zone" : "Save zone"}
      </SubmitButton>
    </form>
  );
}
