import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BoothEditor } from "@/features/booths/components/booth-editor";
import { BoothForm } from "@/features/booths/components/booth-form";
import { BoothList } from "@/features/booths/components/booth-list";
import { listBoothsForEvent } from "@/server/db/repositories/booths.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listMapFloorsForEvent } from "@/server/db/repositories/maps.repository";
import { listParticipationsForEvent } from "@/server/db/repositories/participations.repository";
import { listZonesForEvent } from "@/server/db/repositories/zones.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { publicFileUrl } from "@/server/services/media.service";
import type { BoothStatus } from "@/server/booths/status";

export const metadata: Metadata = {
  title: "Booths",
  robots: { index: false, follow: false },
};

export default async function EventBoothsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "booth.manage",
    `/dashboard/events/${eventId}/booths`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const [zones, floorRows, booths, participations] = await Promise.all([
    listZonesForEvent(ctx.tenant.id, eventId),
    listMapFloorsForEvent(ctx.tenant.id, eventId),
    listBoothsForEvent(ctx.tenant.id, eventId),
    listParticipationsForEvent(ctx.tenant.id, eventId),
  ]);

  const floors = floorRows.map((f) => ({
    id: f.id,
    name: f.name,
    imageUrl:
      f.imageBucket && f.imagePath
        ? publicFileUrl({ bucket: f.imageBucket, path: f.imagePath })
        : null,
    imageWidth: f.imageWidth,
    imageHeight: f.imageHeight,
  }));

  const editorBooths = booths.map((b) => ({
    id: b.id,
    boothNumber: b.boothNumber,
    mapFloorId: b.mapFloorId,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rotation: b.rotation,
    status: b.status as BoothStatus,
    zoneColor: b.zoneColor,
    merchantName: b.merchantName,
  }));

  const listItems = booths.map((b) => ({
    id: b.id,
    boothNumber: b.boothNumber,
    name: b.name,
    zoneId: b.zoneId,
    zoneName: b.zoneName,
    zoneColor: b.zoneColor,
    mapFloorId: b.mapFloorId,
    floorName: floorRows.find((f) => f.id === b.mapFloorId)?.name ?? null,
    status: b.status as BoothStatus,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rotation: b.rotation,
    assignmentId: b.assignmentId,
    merchantName: b.merchantName,
  }));

  const assignedParticipationIds = new Set(
    booths.filter((b) => b.assignmentId).map((b) => b.participationId),
  );
  const assignable = participations
    .filter((p) => p.approvalStatus === "approved" && !assignedParticipationIds.has(p.id))
    .map((p) => ({ id: p.id, merchantName: p.merchantName }));

  const zoneOptions = zones.map((z) => ({ id: z.id, name: z.name }));
  const floorOptions = floors.map((f) => ({ id: f.id, name: f.name }));
  const hasFloorImage = floors.some((f) => f.imageUrl);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Booths</h1>
        <p className="text-muted-foreground text-sm">
          Add booths, place them on the floor plan, and assign merchants.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/events/${eventId}/zones`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Zones
          </Link>
          <Link
            href={`/dashboard/events/${eventId}/map`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Floor plans
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Add a booth
            </CardTitle>
            <CardDescription>
              New booths start at the centre of the floor — drag to place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BoothForm eventId={eventId} mode="create" zones={zoneOptions} floors={floorOptions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Layout
            </CardTitle>
            <CardDescription>
              {hasFloorImage
                ? "Drag booths onto the floor plan."
                : "Upload a floor plan to place booths over an image."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {floors.length > 0 ? (
              <BoothEditor eventId={eventId} floors={floors} booths={editorBooths} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Add a floor on the{" "}
                <Link href={`/dashboard/events/${eventId}/map`} className="underline">
                  Floor plans
                </Link>{" "}
                page first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            All booths ({booths.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BoothList
            eventId={eventId}
            booths={listItems}
            zones={zoneOptions}
            floors={floorOptions}
            assignable={assignable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
