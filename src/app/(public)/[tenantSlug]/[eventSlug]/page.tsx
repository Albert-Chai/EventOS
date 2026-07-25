import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RecentlyViewed } from "@/features/visitors/components/recently-viewed";
import { EventPhaseBadge } from "@/features/events/components/event-status-badge";
import {
  eventTypeLabel,
  formatDayLabel,
  formatEventDates,
  formatTimeRange,
  venueMapUrl,
} from "@/features/events/format";
import {
  getEventBranding,
  getEventSettings,
  listEventOperatingHours,
} from "@/server/db/repositories/event-config.repository";
import { eventHasBooths } from "@/server/db/repositories/booths.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicParticipations } from "@/server/db/repositories/participations.repository";
import { listRecentViewsForRead } from "@/server/services/visitor.service";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Event not found", robots: { index: false, follow: false } };

  const index = event.visibility === "public";
  const base = `/${event.tenantSlug}/${event.slug}`;
  return {
    title: `${event.name} · ${event.tenantName}`,
    description: event.shortDescription ?? undefined,
    robots: { index, follow: index },
    // Installable as its own app (spec §8.10) — the manifest is per-event.
    manifest: `${base}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: event.name, statusBarStyle: "default" },
    openGraph: {
      title: event.name,
      description: event.shortDescription ?? undefined,
      type: "website",
    },
  };
}

export default async function PublicEventPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

  // The single guard that keeps drafts (and any non-public status) off the public
  // web: this returns null unless the event is published/live/ended and reachable.
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const [branding, settings, hours, merchants, hasMap, recentlyViewed] = await Promise.all([
    getEventBranding(event.tenantId, event.id),
    getEventSettings(event.tenantId, event.id),
    listEventOperatingHours(event.tenantId, event.id),
    listPublicParticipations(event.id),
    eventHasBooths(event.id),
    listRecentViewsForRead(event.id),
  ]);

  const primary = branding?.primaryColor ?? "#0f172a";
  const mapUrl = venueMapUrl(event.latitude, event.longitude, event.venueAddress);
  const showHours = (settings?.showOperatingHours ?? true) && hours.length > 0;
  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const enableFavourites = settings?.enableFavourites ?? true;
  const MERCHANT_PREVIEW = 8;
  const previewMerchants = merchants.slice(0, MERCHANT_PREVIEW);

  return (
    <article className="mx-auto w-full max-w-2xl">
      <header
        className="px-4 py-10 text-white sm:rounded-b-2xl sm:px-8"
        style={{ backgroundColor: primary }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
            {eventTypeLabel(event.eventType)}
          </span>
          <EventPhaseBadge phase={event.phase} />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{event.name}</h1>
        <p className="mt-1 text-sm text-white/80">Presented by {event.tenantName}</p>
        {event.shortDescription ? (
          <p className="mt-3 text-white/90">{event.shortDescription}</p>
        ) : null}
      </header>

      <div className="grid gap-8 px-4 py-8 sm:px-8">
        {merchants.length > 0 || hasMap || enableFavourites ? (
          <nav className="flex flex-wrap gap-2">
            {merchants.length > 0 ? (
              <Link
                href={`${baseHref}/merchants`}
                className="hover:bg-muted/50 flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors"
              >
                🔍 Search merchants
              </Link>
            ) : null}
            {hasMap ? (
              <Link
                href={`${baseHref}/map`}
                className="hover:bg-muted/50 flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors"
              >
                🗺️ Map
              </Link>
            ) : null}
            {enableFavourites ? (
              <Link
                href={`${baseHref}/favourites`}
                className="hover:bg-muted/50 flex-1 rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors"
              >
                ♥ Favourites
              </Link>
            ) : null}
          </nav>
        ) : null}

        <RecentlyViewed cards={recentlyViewed} baseHref={baseHref} />

        <section className="grid gap-3">
          <div>
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              When
            </h2>
            <p className="text-sm">
              {formatEventDates(event.startAt, event.endAt, event.timezone)}
            </p>
          </div>
          {event.venueName ? (
            <div>
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Where
              </h2>
              <p className="text-sm">{event.venueName}</p>
              {event.venueAddress ? (
                <p className="text-muted-foreground text-sm">{event.venueAddress}</p>
              ) : null}
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline underline-offset-4"
                  style={{ color: primary }}
                >
                  Open in maps ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </section>

        {event.description ? (
          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="text-sm whitespace-pre-line">{event.description}</p>
          </section>
        ) : null}

        {showHours ? (
          <section className="grid gap-2">
            <h2 className="text-lg font-semibold">Opening hours</h2>
            <ul className="grid gap-1 text-sm">
              {hours.map((h) => (
                <li key={h.id} className="flex justify-between border-b py-1.5 last:border-0">
                  <span>{formatDayLabel(h.date)}</span>
                  <span className={h.isClosed ? "text-muted-foreground" : ""}>
                    {formatTimeRange(h.opensAt, h.closesAt, h.isClosed)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Merchants</h2>
            {merchants.length > MERCHANT_PREVIEW ? (
              <Link
                href={`${baseHref}/merchants`}
                className="text-sm underline underline-offset-4"
                style={{ color: primary }}
              >
                See all {merchants.length} →
              </Link>
            ) : null}
          </div>
          {merchants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Merchant listings will appear here as they&apos;re approved.
            </p>
          ) : (
            <ul className="grid gap-2">
              {previewMerchants.map((m) => (
                <li key={m.participationId}>
                  <a
                    href={`${baseHref}/${m.merchantSlug}`}
                    className="hover:bg-muted/50 flex flex-col gap-0.5 rounded-lg border p-3 transition-colors"
                  >
                    <span className="font-medium">{m.listingTitle || m.merchantName}</span>
                    {m.categoryName ? (
                      <span className="text-muted-foreground text-xs">{m.categoryName}</span>
                    ) : null}
                    {m.listingDescription ? (
                      <span className="text-muted-foreground line-clamp-2 text-sm">
                        {m.listingDescription}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
