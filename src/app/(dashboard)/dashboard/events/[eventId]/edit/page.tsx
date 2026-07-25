import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { EventForm, type EventFormValues } from "@/features/events/components/event-form";
import { toDateTimeLocal } from "@/features/events/format";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Edit event",
  robots: { index: false, follow: false },
};

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "event.update",
    `/dashboard/events/${eventId}/edit`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const defaults: EventFormValues = {
    name: event.name,
    slug: event.slug,
    eventType: event.eventType,
    visibility: event.visibility,
    shortDescription: event.shortDescription ?? "",
    description: event.description ?? "",
    venueName: event.venueName ?? "",
    venueAddress: event.venueAddress ?? "",
    timezone: event.timezone,
    startAt: toDateTimeLocal(event.startAt),
    endAt: toDateTimeLocal(event.endAt),
  };

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit details</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EventForm mode="edit" eventId={eventId} defaults={defaults} />
        </CardContent>
      </Card>
    </div>
  );
}
