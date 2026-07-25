"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";

import { confirmBoothAction } from "../portal-actions";
import { initialBoothFormState } from "../state";

/**
 * The merchant's assigned-booth card in the portal (spec §7 step 7). Shows the
 * booth the organizer assigned and, until confirmed, a confirm button.
 */
export function BoothConfirmCard({
  merchantId,
  participationId,
  assignment,
}: {
  merchantId: string;
  participationId: string;
  assignment: {
    assignmentId: string;
    assignmentStatus: string;
    boothNumber: string;
    boothName: string | null;
    zoneName: string | null;
    zoneColor: string | null;
  };
}) {
  const [state, submit] = useActionState(confirmBoothAction, initialBoothFormState);
  const confirmed = assignment.assignmentStatus === "confirmed";

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Your booth
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {assignment.zoneColor ? (
            <span
              aria-hidden
              className="size-3 rounded-full border"
              style={{ backgroundColor: assignment.zoneColor }}
            />
          ) : null}
          <span className="text-lg font-semibold">{assignment.boothNumber}</span>
          {assignment.boothName ? (
            <span className="text-muted-foreground text-sm">{assignment.boothName}</span>
          ) : null}
          {assignment.zoneName ? (
            <span className="text-muted-foreground text-xs">· {assignment.zoneName}</span>
          ) : null}
        </div>

        {confirmed ? (
          <p className="text-sm font-medium text-green-700 dark:text-green-500">
            ✓ Confirmed — thanks!
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Please confirm this is your booth so the organizer knows you&apos;re set.
            </p>
            <form action={submit}>
              <input type="hidden" name="merchantId" value={merchantId} />
              <input type="hidden" name="participationId" value={participationId} />
              <input type="hidden" name="assignmentId" value={assignment.assignmentId} />
              <SubmitButton size="sm" pendingText="Confirming…">
                Confirm booth
              </SubmitButton>
            </form>
          </>
        )}

        {state.status === "error" && state.message ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
