"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createBoothAction, updateBoothAction } from "../actions";
import { initialBoothFormState } from "../state";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export type BoothFormDefaults = {
  boothNumber: string;
  name: string;
  zoneId: string;
  mapFloorId: string;
  width: number;
  height: number;
  rotation: number;
  x: number;
  y: number;
};

export function BoothForm({
  eventId,
  mode,
  boothId,
  defaults,
  zones,
  floors,
  onDone,
}: {
  eventId: string;
  mode: "create" | "edit";
  boothId?: string;
  defaults?: Partial<BoothFormDefaults>;
  zones: { id: string; name: string }[];
  floors: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const action = mode === "create" ? createBoothAction : updateBoothAction;
  const [state, submit] = useActionState(action, initialBoothFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      {mode === "edit" && boothId ? <input type="hidden" name="boothId" value={boothId} /> : null}
      {/* Preserve position on an edit (the editor owns dragging). */}
      {mode === "edit" ? (
        <>
          <input type="hidden" name="x" value={defaults?.x ?? 0.5} />
          <input type="hidden" name="y" value={defaults?.y ?? 0.5} />
        </>
      ) : null}

      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="boothNumber"
          label="Booth number"
          required
          defaultValue={defaults?.boothNumber}
          errors={fieldErrors.boothNumber}
          placeholder="A-12"
        />
        <FormField
          name="name"
          label="Name (optional)"
          defaultValue={defaults?.name}
          placeholder="Corner unit"
        />
        <div className="grid gap-2">
          <Label htmlFor="booth-zone">Zone</Label>
          <select
            id="booth-zone"
            name="zoneId"
            defaultValue={defaults?.zoneId ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">— None —</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="booth-floor">Floor</Label>
          <select
            id="booth-floor"
            name="mapFloorId"
            defaultValue={defaults?.mapFloorId ?? ""}
            className={SELECT_CLASS}
          >
            <option value="">— Unplaced —</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details className="text-sm">
        <summary className="text-muted-foreground cursor-pointer">Size &amp; rotation</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <FormField
            name="width"
            label="Width"
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            defaultValue={defaults?.width ?? 0.08}
            hint="Fraction of the floor (0–1)."
          />
          <FormField
            name="height"
            label="Height"
            type="number"
            step="0.01"
            min="0.01"
            max="1"
            defaultValue={defaults?.height ?? 0.08}
          />
          <FormField
            name="rotation"
            label="Rotation°"
            type="number"
            step="1"
            defaultValue={defaults?.rotation ?? 0}
          />
        </div>
      </details>

      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText="Saving…">
          {mode === "create" ? "Add booth" : "Save booth"}
        </SubmitButton>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="text-muted-foreground text-sm hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
