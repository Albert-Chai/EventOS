import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/features/ads/components/ad-slot";
import { Track } from "@/features/analytics/components/track";
import { RecentlyViewed } from "@/features/visitors/components/recently-viewed";
import { artStyle, brandStyle } from "@/features/visitors/theme";
import {
  eventTypeLabel,
  formatDayLabel,
  formatEventDates,
  formatTimeRange,
  venueMapUrl,
} from "@/features/events/format";
import { EVENT_PHASE_LABELS } from "@/server/events/status";
import {
  getEventBranding,
  getEventSettings,
  listEventOperatingHours,
} from "@/server/db/repositories/event-config.repository";
import { eventHasBooths } from "@/server/db/repositories/booths.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicParticipations } from "@/server/db/repositories/participations.repository";
import { listFeaturedParticipationIds } from "@/server/services/featured.service";
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

  const [branding, settings, hours, merchants, hasMap, recentlyViewed, featured] =
    await Promise.all([
      getEventBranding(event.tenantId, event.id),
      getEventSettings(event.tenantId, event.id),
      listEventOperatingHours(event.tenantId, event.id),
      listPublicParticipations(event.id),
      eventHasBooths(event.id),
      listRecentViewsForRead(event.id),
      listFeaturedParticipationIds(event.id),
    ]);

  const primary = branding?.primaryColor ?? "#e11d48";
  const mapUrl = venueMapUrl(event.latitude, event.longitude, event.venueAddress);
  const showHours = (settings?.showOperatingHours ?? true) && hours.length > 0;
  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const enableFavourites = settings?.enableFavourites ?? true;
  const enableVouchers = settings?.enableVouchers ?? false;
  const MERCHANT_PREVIEW = 6;
  // Show featured stalls first (the section is titled "Featured stalls"), keeping
  // the alphabetical order within each group — Array.sort is stable.
  const previewMerchants = [...merchants]
    .sort(
      (a, b) => Number(featured.has(b.participationId)) - Number(featured.has(a.participationId)),
    )
    .slice(0, MERCHANT_PREVIEW);

  return (
    <article
      className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8"
      style={brandStyle(primary)}
    >
      <Track name="event_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      {/* From lg the page splits: the story on the left, the reference facts in a
          sticky rail on the right. Below lg it's one column in DOM order, so the
          rail's cards simply fall to the end — where they belong on a phone,
          since the hero already carries the date and venue as chips. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="grid min-w-0 gap-6">
          {/* HERO — a brand-coloured cover card. */}
          <header className="app-header relative overflow-hidden rounded-3xl px-5 py-7 sm:px-7 lg:px-10 lg:py-12">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase">
                {event.phase === "live" ? "● Live now" : EVENT_PHASE_LABELS[event.phase]}
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                {eventTypeLabel(event.eventType)}
              </span>
            </div>
            <h1 className="mt-3 text-[clamp(1.9rem,7vw,2.75rem)] leading-[1.02] font-extrabold tracking-tight text-balance lg:text-5xl">
              {event.name}
            </h1>
            <p className="mt-1 text-sm text-white/80">Presented by {event.tenantName}</p>
            {event.shortDescription ? (
              <p className="mt-2 max-w-prose text-[15px] text-white/90">{event.shortDescription}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
                📅 {formatEventDates(event.startAt, event.endAt, event.timezone)}
              </span>
              {event.venueName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
                  📍 {event.venueName}
                </span>
              ) : null}
            </div>

            {merchants.length > 0 || enableVouchers ? (
              <div className="mt-5 flex flex-wrap gap-2.5">
                {merchants.length > 0 ? (
                  <Link
                    href={`${baseHref}/merchants`}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold text-[var(--brand)] shadow-sm transition-transform hover:-translate-y-0.5"
                  >
                    Explore {merchants.length} stalls →
                  </Link>
                ) : null}
                {enableVouchers ? (
                  <Link
                    href={`${baseHref}/vouchers`}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-white/20"
                  >
                    🎟️ Vouchers
                  </Link>
                ) : null}
              </div>
            ) : null}
          </header>

          <AdSlot slot="event_landing" tenantSlug={tenantSlug} eventSlug={eventSlug} />

          {/* Quick nav — the secondary destinations. */}
          {hasMap || enableFavourites ? (
            <nav className="flex flex-wrap gap-2">
              {hasMap ? (
                <Link
                  href={`${baseHref}/map`}
                  className="app-card app-card-hover flex-1 px-3 py-2.5 text-center text-sm font-semibold lg:flex-none lg:px-8"
                >
                  🗺️ Floor plan
                </Link>
              ) : null}
              {enableFavourites ? (
                <Link
                  href={`${baseHref}/favourites`}
                  className="app-card app-card-hover flex-1 px-3 py-2.5 text-center text-sm font-semibold lg:flex-none lg:px-8"
                >
                  ♥ Saved
                </Link>
              ) : null}
            </nav>
          ) : null}

          <RecentlyViewed cards={recentlyViewed} baseHref={baseHref} />

          {event.description ? (
            <section className="grid gap-2">
              <h2 className="text-foreground text-lg font-bold tracking-tight">About</h2>
              <p className="text-muted-foreground max-w-prose text-sm whitespace-pre-line">
                {event.description}
              </p>
            </section>
          ) : null}

          {/* Featured stalls. */}
          <section className="grid gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="app-eyebrow">Featured stalls</h2>
              {merchants.length > MERCHANT_PREVIEW ? (
                <Link
                  href={`${baseHref}/merchants`}
                  className="text-muted-foreground hover:text-foreground text-sm font-semibold underline-offset-4 hover:underline"
                >
                  See all {merchants.length} →
                </Link>
              ) : null}
            </div>
            {merchants.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Stall listings will appear here as they&apos;re approved.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>li]:min-w-0">
                {previewMerchants.map((m) => (
                  <li key={m.participationId}>
                    <a
                      href={`${baseHref}/${m.merchantSlug}`}
                      className="app-card app-card-hover flex h-full flex-col overflow-hidden p-3"
                    >
                      <span
                        className="app-art relative mb-3 h-24 rounded-xl text-4xl"
                        style={artStyle(m.merchantSlug)}
                        aria-hidden
                      >
                        🍢
                        {featured.has(m.participationId) ? (
                          <span className="absolute top-2 right-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--brand)] uppercase">
                            ★ Featured
                          </span>
                        ) : null}
                      </span>
                      <span className="text-foreground font-bold tracking-tight">
                        {m.listingTitle || m.merchantName}
                      </span>
                      {m.categoryName ? (
                        <span className="mt-0.5 text-xs font-semibold text-[var(--brand)]">
                          {m.categoryName}
                        </span>
                      ) : null}
                      {m.listingDescription ? (
                        <span className="text-muted-foreground mt-1 line-clamp-2 text-sm">
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

        {/* The facts rail. Sticky from lg so the venue and hours stay in view
            while the stall list scrolls; a plain stack of cards below that. */}
        <aside className="grid gap-3 lg:sticky lg:top-24 lg:gap-4">
          <div className="app-card p-4">
            <h2 className="app-eyebrow">When</h2>
            <p className="text-foreground mt-1.5 text-sm">
              {formatEventDates(event.startAt, event.endAt, event.timezone)}
            </p>
          </div>

          {event.venueName ? (
            <div className="app-card p-4">
              <h2 className="app-eyebrow">Where</h2>
              <p className="text-foreground mt-1.5 text-sm">{event.venueName}</p>
              {event.venueAddress ? (
                <p className="text-muted-foreground mt-0.5 text-sm">{event.venueAddress}</p>
              ) : null}
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
                >
                  Open in maps ↗
                </a>
              ) : null}
            </div>
          ) : null}

          {showHours ? (
            <div className="app-card px-4 py-3">
              <h2 className="app-eyebrow">Opening hours</h2>
              <ul className="mt-1 grid text-sm">
                {hours.map((h) => (
                  <li
                    key={h.id}
                    className="border-border flex justify-between gap-3 border-b py-2.5 last:border-0"
                  >
                    <span className="text-foreground">{formatDayLabel(h.date)}</span>
                    <span className={h.isClosed ? "text-muted-foreground" : "text-foreground/80"}>
                      {formatTimeRange(h.opensAt, h.closesAt, h.isClosed)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
