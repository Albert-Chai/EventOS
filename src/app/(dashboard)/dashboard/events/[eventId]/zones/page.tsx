import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteZoneAction } from "@/features/booths/actions";
import { ZoneForm } from "@/features/booths/components/zone-form";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listZonesForEvent } from "@/server/db/repositories/zones.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Zones",
  robots: { index: false, follow: false },
};

export default async function EventZonesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "booth.manage",
    `/dashboard/events/${eventId}/zones`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();
  const zones = await listZonesForEvent(ctx.tenant.id, eventId);

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Zones</h1>
        <p className="text-muted-foreground text-sm">
          Group booths into areas — visitors filter the map by zone.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            New zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ZoneForm eventId={eventId} mode="create" />
        </CardContent>
      </Card>

      {zones.length > 0 ? (
        <div className="grid gap-3">
          {zones.map((zone) => (
            <Card key={zone.id}>
              <CardContent className="grid gap-4 pt-6">
                <ZoneForm eventId={eventId} mode="edit" zone={zone} />
                <form action={deleteZoneAction}>
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="zoneId" value={zone.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                    Delete zone
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No zones yet.</p>
      )}
    </div>
  );
}
