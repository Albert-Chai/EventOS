import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicMap } from "@/features/booths/components/public-map";
import { listBoothsForEventPublic } from "@/server/db/repositories/booths.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listMapFloorsForEventPublic } from "@/server/db/repositories/maps.repository";
import { listZonesForEventPublic } from "@/server/db/repositories/zones.repository";
import { publicFileUrl } from "@/server/services/media.service";
import type { BoothStatus } from "@/server/booths/status";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };
type Search = { searchParams: Promise<{ booth?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Map not found", robots: { index: false, follow: false } };
  return {
    title: `Map · ${event.name}`,
    description: `Interactive map for ${event.name}.`,
    robots: { index: event.visibility === "public", follow: true },
  };
}

export default async function PublicMapPage({ params, searchParams }: Params & Search) {
  const { tenantSlug, eventSlug } = await params;
  const { booth } = await searchParams;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const [floorRows, boothRows, zones] = await Promise.all([
    listMapFloorsForEventPublic(event.id),
    listBoothsForEventPublic(event.id),
    listZonesForEventPublic(event.id),
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

  const booths = boothRows.map((b) => ({
    id: b.id,
    boothNumber: b.boothNumber,
    name: b.name,
    zoneId: b.zoneId,
    mapFloorId: b.mapFloorId,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rotation: b.rotation,
    status: b.status as BoothStatus,
    merchantSlug: b.merchantSlug,
    merchantName: b.merchantName,
    listingTitle: b.listingTitle,
  }));

  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <div className="mb-4 grid gap-1">
        <Link href={baseHref} className="text-muted-foreground text-sm hover:underline">
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Event map</h1>
        <p className="text-muted-foreground text-sm">
          Find booths and merchants. Drag to pan, pinch or scroll to zoom.
        </p>
      </div>

      {booths.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          The map for this event isn&apos;t ready yet. Check back soon.
        </p>
      ) : (
        <PublicMap
          baseHref={baseHref}
          floors={floors}
          booths={booths}
          zones={zones}
          initialBooth={booth}
        />
      )}
    </article>
  );
}
