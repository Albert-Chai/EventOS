import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { OperatingHoursEditor } from "@/features/events/components/operating-hours-editor";
import { listEventOperatingHours } from "@/server/db/repositories/event-config.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Operating hours",
  robots: { index: false, follow: false },
};

/** DB time ("HH:MM:SS" or null) → the "HH:MM" a <input type="time"> expects. */
function toTimeInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

export default async function EventHoursPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "event.update",
    `/dashboard/events/${eventId}/hours`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();
  const hours = await listEventOperatingHours(ctx.tenant.id, eventId);

  const initialRows = hours.map((h) => ({
    date: h.date,
    opensAt: toTimeInput(h.opensAt),
    closesAt: toTimeInput(h.closesAt),
    isClosed: h.isClosed,
    note: h.note ?? "",
  }));

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Operating hours</h1>
        <p className="text-muted-foreground text-sm">
          One row per day the event runs. Mark a day closed to keep it in the schedule without
          hours.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <OperatingHoursEditor eventId={eventId} initialRows={initialRows} />
        </CardContent>
      </Card>
    </div>
  );
}
