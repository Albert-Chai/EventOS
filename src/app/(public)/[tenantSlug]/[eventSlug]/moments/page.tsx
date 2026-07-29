import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ChevronLeft, Grid3x3, Rows3, SquarePlus } from "lucide-react";

import { Track } from "@/features/analytics/components/track";
import { MomentCard, MomentTile } from "@/features/moments/components/moment-card";
import { brandStyle } from "@/features/visitors/theme";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicFeed } from "@/server/services/moment.service";
import { getSignedInVisitorForRead } from "@/server/services/visitor-account.service";

type Params = {
  params: Promise<{ tenantSlug: string; eventSlug: string }>;
  searchParams: Promise<{ view?: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `Moments · ${event.name}`,
    description: `What visitors are eating and seeing at ${event.name}.`,
    robots: { index: event.visibility === "public", follow: true },
  };
}

/**
 * The Moments feed — its own bottom-nav tab, per the product decision (no
 * stall-page strip, no landing strip).
 *
 * Laid out as a photo feed: white ground, full-bleed media, hairline rules. The
 * `.moments` scope in globals.css is what swaps the app's card-on-grey surface
 * for this one, so the rest of the visitor app is untouched.
 *
 * Reading needs no account. `getSignedInVisitorForRead` never mints a cookie or
 * a row, so a logged-out visitor browsing the feed still writes nothing.
 *
 * Feed/Grid is a `?view=` param rather than client state: it survives a share,
 * a refresh, and the back button, and costs no JavaScript.
 */
export default async function MomentsPage({ params, searchParams }: Params) {
  const { tenantSlug, eventSlug } = await params;
  const { view } = await searchParams;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  // Sequential: the dev/test pooler caps at one connection.
  const viewer = await getSignedInVisitorForRead();
  const feed = await listPublicFeed({ tenantSlug, eventSlug }, viewer?.visitor.id ?? null);

  // Moments off for this event is indistinguishable from "no such page".
  if (!feed) notFound();

  const branding = await getEventBranding(event.tenantId, event.id);
  const primary = branding?.primaryColor ?? "#e11d48";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const feedHref = `${baseHref}/moments`;
  const composeHref = `${feedHref}/new`;

  const withPhotos = feed.posts.filter((p) => p.imageUrl);
  const isGrid = view === "grid" && withPhotos.length > 0;

  return (
    <div className="moments min-h-dvh" style={brandStyle(primary)}>
      <Track name="moment_feed_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      <div className="mx-auto w-full max-w-[470px]">
        {/* Feed bar — sits under the app header, the way a photo app's second
            bar does: where you are on the left, what you can add on the right. */}
        <div className="sticky top-[57px] z-30 flex items-center gap-1 border-b border-[var(--feed-line)] bg-white/95 px-2 py-2 backdrop-blur">
          <Link
            href={baseHref}
            aria-label={event.name}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-bold tracking-tight">Moments</h1>
            <p className="truncate text-[11px] text-[var(--feed-muted)]">
              {feed.total} {feed.total === 1 ? "post" : "posts"} · {event.name}
            </p>
          </div>
          <Link
            href={viewer ? composeHref : `/sign-in?next=${encodeURIComponent(composeHref)}`}
            aria-label="Share a moment"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--brand)] hover:bg-black/5"
          >
            <SquarePlus aria-hidden className="size-6" />
          </Link>
        </div>

        {/* Feed / Grid — only worth showing once there are photos to grid. */}
        {withPhotos.length > 0 ? (
          <div className="flex border-b border-[var(--feed-line)]">
            <Link href={feedHref} className="moment-tab" data-active={!isGrid}>
              <Rows3 aria-hidden className="size-4" />
              Feed
            </Link>
            <Link href={`${feedHref}?view=grid`} className="moment-tab" data-active={isGrid}>
              <Grid3x3 aria-hidden className="size-4" />
              Grid
            </Link>
          </div>
        ) : null}

        {/* Signed-out prompt — quiet, and only once, at the top. */}
        {!viewer ? (
          <div className="flex items-center gap-3 border-b border-[var(--feed-line)] px-3 py-3">
            <span aria-hidden className="moment-avatar size-9 shrink-0">
              <Camera className="size-4" />
            </span>
            <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--feed-muted)]">
              <span className="block text-sm font-semibold text-[var(--feed-ink)]">
                Been to the festival?
              </span>
              Sign in to post. Browsing needs no account.
            </p>
            <Link
              href={`/sign-in?next=${encodeURIComponent(composeHref)}`}
              className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-[var(--brand-ink)]"
            >
              Sign in
            </Link>
          </div>
        ) : null}

        {feed.posts.length === 0 ? (
          <div className="grid place-items-center gap-3 px-8 py-20 text-center">
            <span aria-hidden className="moment-avatar size-16">
              <Camera className="size-7" />
            </span>
            <p className="text-lg font-bold tracking-tight">No moments yet</p>
            <p className="text-sm text-[var(--feed-muted)]">
              Be the first to share something from the festival.
            </p>
            <Link
              href={viewer ? composeHref : `/sign-in?next=${encodeURIComponent(composeHref)}`}
              className="app-cta mt-1 px-5 py-2.5 text-sm"
            >
              {viewer ? "Share a moment" : "Sign in to post"}
            </Link>
          </div>
        ) : isGrid ? (
          <ul className="grid grid-cols-3 gap-px [&>li]:min-w-0">
            {withPhotos.map((post) => (
              <MomentTile key={post.id} post={post} baseHref={baseHref} />
            ))}
          </ul>
        ) : (
          <ul className="[&>li]:min-w-0">
            {feed.posts.map((post) => (
              <MomentCard
                key={post.id}
                post={post}
                baseHref={baseHref}
                tenantSlug={tenantSlug}
                eventSlug={eventSlug}
                canInteract={Boolean(viewer)}
                signInHref={`/sign-in?next=${encodeURIComponent(feedHref)}`}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
