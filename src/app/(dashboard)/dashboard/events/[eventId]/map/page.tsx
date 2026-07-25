import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { FloorManager } from "@/features/booths/components/floor-manager";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listMapFloorsForEvent } from "@/server/db/repositories/maps.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { publicFileUrl } from "@/server/services/media.service";

export const metadata: Metadata = {
  title: "Event map",
  robots: { index: false, follow: false },
};

export default async function EventMapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect("map.manage", `/dashboard/events/${eventId}/map`);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const floors = await listMapFloorsForEvent(ctx.tenant.id, eventId);
  const rows = floors.map((f) => ({
    id: f.id,
    name: f.name,
    imageUrl:
      f.imageBucket && f.imagePath
        ? publicFileUrl({ bucket: f.imageBucket, path: f.imagePath })
        : null,
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
        <h1 className="text-2xl font-semibold tracking-tight">Event map</h1>
        <p className="text-muted-foreground text-sm">
          Upload a floor plan per floor. Then place booths on the{" "}
          <Link href={`/dashboard/events/${eventId}/booths`} className="underline">
            Booths
          </Link>{" "}
          page.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <FloorManager eventId={eventId} floors={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
