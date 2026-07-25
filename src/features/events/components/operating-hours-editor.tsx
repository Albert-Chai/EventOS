"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";

import { updateHoursAction } from "../actions";
import { initialEventFormState } from "../state";

type Row = { date: string; opensAt: string; closesAt: string; isClosed: boolean; note: string };

const INPUT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

const blankRow = (): Row => ({
  date: "",
  opensAt: "10:00",
  closesAt: "22:00",
  isClosed: false,
  note: "",
});

/**
 * Per-date operating hours. Rows are edited client-side and serialised to a
 * single hidden `hours` field on submit; the action validates and replaces the
 * full set (spec §8.3 "daily opening hours").
 */
export function OperatingHoursEditor({
  eventId,
  initialRows,
}: {
  eventId: string;
  initialRows: Row[];
}) {
  const [state, submit] = useActionState(updateHoursAction, initialEventFormState);
  const [rows, setRows] = useState<Row[]>(initialRows.length > 0 ? initialRows : [blankRow()]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

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

      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="hours" value={JSON.stringify(rows)} />

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No days yet — add one below.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row, i) => (
            <li
              key={i}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-center"
            >
              <input
                type="date"
                aria-label="Date"
                value={row.date}
                onChange={(e) => update(i, { date: e.target.value })}
                className={INPUT_CLASS}
              />
              <input
                type="time"
                aria-label="Opens"
                value={row.opensAt}
                disabled={row.isClosed}
                onChange={(e) => update(i, { opensAt: e.target.value })}
                className={INPUT_CLASS}
              />
              <input
                type="time"
                aria-label="Closes"
                value={row.closesAt}
                disabled={row.isClosed}
                onChange={(e) => update(i, { closesAt: e.target.value })}
                className={INPUT_CLASS}
              />
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.isClosed}
                  onChange={(e) => update(i, { isClosed: e.target.checked })}
                  className="size-4"
                />
                Closed
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
        >
          Add a day
        </Button>
        <SubmitButton size="sm" pendingText="Saving…">
          Save operating hours
        </SubmitButton>
      </div>
    </form>
  );
}
