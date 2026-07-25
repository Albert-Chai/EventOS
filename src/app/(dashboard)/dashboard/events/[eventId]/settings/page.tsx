import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/features/events/components/settings-form";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Event settings",
  robots: { index: false, follow: false },
};

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "event.update",
    `/dashboard/events/${eventId}/settings`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();
  const settings = await getEventSettings(ctx.tenant.id, eventId);
  if (!settings) notFound();

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Toggle the features visitors and merchants see for this event.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SettingsForm eventId={eventId} settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
