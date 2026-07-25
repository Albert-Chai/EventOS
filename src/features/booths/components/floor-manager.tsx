"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImageUploadField } from "@/components/media/image-upload-field";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { createFloorAction, deleteFloorAction, updateFloorAction } from "../actions";
import { initialBoothFormState } from "../state";

export type FloorRow = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export function FloorManager({ eventId, floors }: { eventId: string; floors: FloorRow[] }) {
  const [createState, create] = useActionState(createFloorAction, initialBoothFormState);

  return (
    <div className="grid gap-4">
      <form action={create} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <FormField
          name="name"
          label="New floor"
          required
          className="min-w-48 flex-1"
          placeholder="Ground floor"
        />
        <SubmitButton size="sm" pendingText="Adding…">
          Add floor
        </SubmitButton>
        {createState.status === "error" && createState.message ? (
          <Alert variant="destructive" role="alert" className="w-full">
            <AlertDescription>{createState.message}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      {floors.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No floors yet. Add one, then upload its floor plan to place booths on the map.
        </p>
      ) : (
        <div className="grid gap-3">
          {floors.map((floor) => (
            <FloorCard key={floor.id} eventId={eventId} floor={floor} />
          ))}
        </div>
      )}
    </div>
  );
}

function FloorCard({ eventId, floor }: { eventId: string; floor: FloorRow }) {
  const [state, submit] = useActionState(updateFloorAction, initialBoothFormState);

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <form action={submit} className="grid gap-4">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="floorId" value={floor.id} />
          <FormField name="name" label="Floor name" defaultValue={floor.name} required />
          <ImageUploadField
            name="image"
            label="Floor plan"
            aspect="wide"
            currentUrl={floor.imageUrl}
            hint="PNG, JPEG, WebP or AVIF, up to 6 MB. Booths are plotted over this image."
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
            Save floor
          </SubmitButton>
        </form>

        <form action={deleteFloorAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="floorId" value={floor.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive">
            Delete floor
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
