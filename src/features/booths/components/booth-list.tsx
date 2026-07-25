"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  BOOTH_STATUS_LABELS,
  ORGANIZER_SETTABLE_BOOTH_STATUSES,
  type BoothStatus,
} from "@/server/booths/status";

import {
  assignBoothAction,
  deleteBoothAction,
  setBoothStatusAction,
  unassignBoothAction,
} from "../actions";
import { initialBoothFormState } from "../state";
import { BoothForm } from "./booth-form";
import { BoothStatusBadge } from "./booth-status-badge";

export type BoothListItem = {
  id: string;
  boothNumber: string;
  name: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneColor: string | null;
  mapFloorId: string | null;
  floorName: string | null;
  status: BoothStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  assignmentId: string | null;
  merchantName: string | null;
};

const SELECT_CLASS = "border-input h-8 rounded-lg border bg-transparent px-2 text-sm outline-none";

export function BoothList({
  eventId,
  booths,
  zones,
  floors,
  assignable,
}: {
  eventId: string;
  booths: BoothListItem[];
  zones: { id: string; name: string }[];
  floors: { id: string; name: string }[];
  assignable: { id: string; merchantName: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (booths.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No booths yet. Add one above — it appears on the editor to place.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {booths.map((booth) => (
        <li key={booth.id} className="grid gap-3 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full border"
              style={{ backgroundColor: booth.zoneColor ?? "transparent" }}
            />
            <span className="font-medium">{booth.boothNumber}</span>
            {booth.name ? (
              <span className="text-muted-foreground text-sm">{booth.name}</span>
            ) : null}
            <BoothStatusBadge status={booth.status} />
            {booth.zoneName ? (
              <span className="text-muted-foreground text-xs">· {booth.zoneName}</span>
            ) : null}
            {booth.floorName ? (
              <span className="text-muted-foreground text-xs">· {booth.floorName}</span>
            ) : (
              <span className="text-muted-foreground text-xs">· Unplaced</span>
            )}
            {booth.merchantName ? <span className="text-sm">→ {booth.merchantName}</span> : null}
            <button
              type="button"
              onClick={() => setEditingId((id) => (id === booth.id ? null : booth.id))}
              className="text-muted-foreground ml-auto text-sm hover:underline"
            >
              {editingId === booth.id ? "Close" : "Edit"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {booth.assignmentId ? (
              <form action={unassignBoothAction}>
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="assignmentId" value={booth.assignmentId} />
                <Button type="submit" variant="outline" size="sm">
                  Unassign
                </Button>
              </form>
            ) : (
              <>
                <AssignControl eventId={eventId} boothId={booth.id} assignable={assignable} />
                <form action={setBoothStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="boothId" value={booth.id} />
                  <select name="status" defaultValue={booth.status} className={SELECT_CLASS}>
                    {ORGANIZER_SETTABLE_BOOTH_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {BOOTH_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="ghost" size="sm">
                    Set
                  </Button>
                </form>
                <form action={deleteBoothAction}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="boothId" value={booth.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                    Delete
                  </Button>
                </form>
              </>
            )}
          </div>

          {editingId === booth.id ? (
            <div className="bg-muted/40 rounded-lg border p-4">
              <BoothForm
                eventId={eventId}
                mode="edit"
                boothId={booth.id}
                zones={zones}
                floors={floors}
                onDone={() => setEditingId(null)}
                defaults={{
                  boothNumber: booth.boothNumber,
                  name: booth.name ?? "",
                  zoneId: booth.zoneId ?? "",
                  mapFloorId: booth.mapFloorId ?? "",
                  width: booth.width,
                  height: booth.height,
                  rotation: booth.rotation,
                  x: booth.x,
                  y: booth.y,
                }}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AssignControl({
  eventId,
  boothId,
  assignable,
}: {
  eventId: string;
  boothId: string;
  assignable: { id: string; merchantName: string }[];
}) {
  const [state, submit] = useActionState(assignBoothAction, initialBoothFormState);

  if (assignable.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">No approved merchants free to assign.</span>
    );
  }

  return (
    <form action={submit} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="boothId" value={boothId} />
      <select name="participationId" defaultValue="" className={SELECT_CLASS} required>
        <option value="" disabled>
          Assign merchant…
        </option>
        {assignable.map((p) => (
          <option key={p.id} value={p.id}>
            {p.merchantName}
          </option>
        ))}
      </select>
      <SubmitButton size="sm" variant="outline" pendingText="…">
        Assign
      </SubmitButton>
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert" className="w-full">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
