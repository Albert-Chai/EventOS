import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { EventForm, type EventFormValues } from "@/features/events/components/event-form";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "New event",
  robots: { index: false, follow: false },
};

const BLANK: EventFormValues = {
  name: "",
  slug: "",
  eventType: "other",
  visibility: "public",
  shortDescription: "",
  description: "",
  venueName: "",
  venueAddress: "",
  timezone: "",
  startAt: "",
  endAt: "",
};

export default async function NewEventPage() {
  await requirePermissionOrRedirect("event.create", "/dashboard/events/new");

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link href="/dashboard/events" className="text-muted-foreground text-sm hover:underline">
          ← Events
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New event</h1>
        <p className="text-muted-foreground text-sm">
          Start with the essentials — you can fill in the rest and publish later.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EventForm mode="create" defaults={BLANK} />
        </CardContent>
      </Card>
    </div>
  );
}
