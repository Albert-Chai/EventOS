import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/features/ads/components/ad-slot";
import { Track } from "@/features/analytics/components/track";
import { PublicMap } from "@/features/booths/components/public-map";
import { brandStyle } from "@/features/visitors/theme";
import { listBoothsForEventPublic } from "@/server/db/repositories/booths.repository";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
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

  const [floorRows, boothRows, zones, branding] = await Promise.all([
    listMapFloorsForEventPublic(event.id),
    listBoothsForEventPublic(event.id),
    listZonesForEventPublic(event.id),
    getEventBranding(event.tenantId, event.id),
  ]);
  const primary = branding?.primaryColor ?? "#e11d48";

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

  // Full-bleed app screen: the map fills the viewport under the shell chrome,
  // so it gets no page padding and cancels the layout's bottom-nav spacing.
  return (
    <article className="-mb-24 lg:-mb-10" style={brandStyle(primary)}>
      <Track name="map_opened" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      {booths.length === 0 ? (
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <Link
            href={baseHref}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← {event.name}
          </Link>
          <h1 className="text-foreground mt-1 text-3xl font-extrabold tracking-tight">
            Floor plan
          </h1>
          <p className="text-muted-foreground mt-4 text-sm">
            The map for this event isn&apos;t ready yet. Check back soon.
          </p>
        </div>
      ) : (
        <PublicMap
          baseHref={baseHref}
          eventName={event.name}
          venueName={event.venueName}
          floors={floors}
          booths={booths}
          zones={zones}
          initialBooth={booth}
          adSlot={
            <AdSlot
              slot="floor_plan"
              tenantSlug={tenantSlug}
              eventSlug={eventSlug}
              className="mt-3"
            />
          }
        />
      )}
    </article>
  );
}
