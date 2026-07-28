import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Track } from "@/features/analytics/components/track";
import { RecentlyViewed } from "@/features/visitors/components/recently-viewed";
import { artStyle, brandStyle } from "@/features/visitors/neon";
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

  const [branding, settings, hours, merchants, hasMap, recentlyViewed, featured] = await Promise.all([
    getEventBranding(event.tenantId, event.id),
    getEventSettings(event.tenantId, event.id),
    listEventOperatingHours(event.tenantId, event.id),
    listPublicParticipations(event.id),
    eventHasBooths(event.id),
    listRecentViewsForRead(event.id),
    listFeaturedParticipationIds(event.id),
  ]);

  const primary = branding?.primaryColor ?? "#ff2d78";
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
      (a, b) =>
        Number(featured.has(b.participationId)) - Number(featured.has(a.participationId)),
    )
    .slice(0, MERCHANT_PREVIEW);

  return (
    <article className="mx-auto w-full max-w-2xl pb-24" style={brandStyle(primary)}>
      <Track name="event_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      {/* HERO — brand glow behind an oversized display headline. */}
      <header className="neon-hero relative px-5 pt-9 pb-10 sm:rounded-b-[2rem] sm:px-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="neon-kick">
            {event.phase === "live" ? "● Live now" : EVENT_PHASE_LABELS[event.phase]}
          </span>
          <span className="neon-pill">{eventTypeLabel(event.eventType)}</span>
        </div>
        <h1 className="neon-display mt-4 text-[clamp(2.4rem,11vw,3.75rem)] font-extrabold leading-[0.95] tracking-tight text-balance">
          {event.name}
        </h1>
        <p className="mt-2 text-sm text-white/60">Presented by {event.tenantName}</p>
        {event.shortDescription ? (
          <p className="mt-3 max-w-prose text-[15px] text-white/85">{event.shortDescription}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="neon-pill">📅 {formatEventDates(event.startAt, event.endAt, event.timezone)}</span>
          {event.venueName ? <span className="neon-pill">📍 {event.venueName}</span> : null}
        </div>

        {merchants.length > 0 || enableVouchers ? (
          <div className="mt-6 flex flex-wrap gap-2.5">
            {merchants.length > 0 ? (
              <Link href={`${baseHref}/merchants`} className="neon-cta px-6 py-3.5 text-[15px]">
                Explore {merchants.length} stalls →
              </Link>
            ) : null}
            {enableVouchers ? (
              <Link
                href={`${baseHref}/vouchers`}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-[15px] font-bold text-white backdrop-blur transition-colors hover:bg-white/15"
              >
                🎟️ Vouchers
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-8 px-5 py-8 sm:px-8">
        {/* Quick nav — the secondary destinations. */}
        {hasMap || enableFavourites ? (
          <nav className="flex flex-wrap gap-2">
            {hasMap ? (
              <Link
                href={`${baseHref}/map`}
                className="neon-surface neon-surface-hover flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition-colors"
              >
                🗺️ Map
              </Link>
            ) : null}
            {enableFavourites ? (
              <Link
                href={`${baseHref}/favourites`}
                className="neon-surface neon-surface-hover flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition-colors"
              >
                ♥ Favourites
              </Link>
            ) : null}
          </nav>
        ) : null}

        <RecentlyViewed cards={recentlyViewed} baseHref={baseHref} />

        {/* When / Where — glass info cards. */}
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="neon-surface rounded-2xl p-4">
            <h2 className="text-[11px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
              When
            </h2>
            <p className="mt-1.5 text-sm text-white/90">
              {formatEventDates(event.startAt, event.endAt, event.timezone)}
            </p>
          </div>
          {event.venueName ? (
            <div className="neon-surface rounded-2xl p-4">
              <h2 className="text-[11px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
                Where
              </h2>
              <p className="mt-1.5 text-sm text-white/90">{event.venueName}</p>
              {event.venueAddress ? (
                <p className="mt-0.5 text-sm text-white/55">{event.venueAddress}</p>
              ) : null}
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-semibold text-[var(--neon-lime)] underline-offset-4 hover:underline"
                >
                  Open in maps ↗
                </a>
              ) : null}
            </div>
          ) : null}
        </section>

        {event.description ? (
          <section className="grid gap-2">
            <h2 className="text-lg font-bold tracking-tight">About</h2>
            <p className="text-sm whitespace-pre-line text-white/80">{event.description}</p>
          </section>
        ) : null}

        {showHours ? (
          <section className="grid gap-2">
            <h2 className="text-lg font-bold tracking-tight">Opening hours</h2>
            <ul className="neon-surface grid gap-0.5 rounded-2xl px-4 py-1 text-sm">
              {hours.map((h) => (
                <li
                  key={h.id}
                  className="flex justify-between border-b border-white/10 py-2.5 last:border-0"
                >
                  <span className="text-white/90">{formatDayLabel(h.date)}</span>
                  <span className={h.isClosed ? "text-white/40" : "text-white/70"}>
                    {formatTimeRange(h.opensAt, h.closesAt, h.isClosed)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Merchants — colourful gradient-art cards. */}
        <section className="grid gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
              Featured stalls
            </h2>
            {merchants.length > MERCHANT_PREVIEW ? (
              <Link
                href={`${baseHref}/merchants`}
                className="text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                See all {merchants.length} →
              </Link>
            ) : null}
          </div>
          {merchants.length === 0 ? (
            <p className="text-sm text-white/55">
              Stall listings will appear here as they&apos;re approved.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {previewMerchants.map((m) => (
                <li key={m.participationId}>
                  <a
                    href={`${baseHref}/${m.merchantSlug}`}
                    className="neon-surface neon-surface-hover group flex h-full flex-col overflow-hidden rounded-2xl p-3 transition-colors"
                  >
                    <span
                      className="neon-art relative mb-3 h-24 rounded-xl text-4xl"
                      style={artStyle(m.merchantSlug)}
                      aria-hidden
                    >
                      🍢
                      {featured.has(m.participationId) ? (
                        <span className="absolute top-2 right-2 rounded-full bg-[var(--neon-lime)] px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[#14061f] uppercase">
                          ★ Featured
                        </span>
                      ) : null}
                    </span>
                    <span className="font-bold tracking-tight text-white">
                      {m.listingTitle || m.merchantName}
                    </span>
                    {m.categoryName ? (
                      <span className="mt-0.5 text-xs text-[var(--neon-mint)]">{m.categoryName}</span>
                    ) : null}
                    {m.listingDescription ? (
                      <span className="mt-1 line-clamp-2 text-sm text-white/55">
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

      {/* Sticky claim bar — the festival's standing call to action. */}
      {enableVouchers ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-[#1a0b2e] to-transparent px-4 pt-8 pb-4">
          <Link
            href={`${baseHref}/vouchers`}
            className="neon-cta mx-auto flex w-full max-w-md px-6 py-3.5 text-[15px]"
          >
            🎟️ Claim your vouchers
          </Link>
        </div>
      ) : null}
    </article>
  );
}
