import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Track } from "@/features/analytics/components/track";
import { MomentCard } from "@/features/moments/components/moment-card";
import { brandStyle } from "@/features/visitors/theme";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicFeed } from "@/server/services/moment.service";
import { getSignedInVisitorForRead } from "@/server/services/visitor-account.service";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

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
 * The Moments feed — the one place visitor posts live (its own bottom-nav tab,
 * per the product decision: no stall-page strip, no landing strip).
 *
 * Reading needs no account. `getSignedInVisitorForRead` never mints a cookie or
 * a row, so a logged-out visitor browsing the feed still writes nothing.
 */
export default async function MomentsPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

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
  const composeHref = `${baseHref}/moments/new`;

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" style={brandStyle(primary)}>
      <Track name="moment_feed_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      <div className="mb-5 grid gap-1">
        <Link
          href={baseHref}
          className="text-muted-foreground hover:text-foreground min-h-9 text-sm transition-colors"
        >
          ← {event.name}
        </Link>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h1 className="text-foreground text-3xl font-extrabold tracking-tight">Moments</h1>
          <span className="text-sm text-[var(--app-muted)]">
            {feed.total} {feed.total === 1 ? "post" : "posts"}
          </span>
        </div>
        <p className="text-sm text-[var(--app-muted)]">
          What people are eating, drinking, and queuing for right now.
        </p>
      </div>

      {viewer ? (
        <Link href={composeHref} className="app-cta mb-5 flex w-full justify-center">
          Share a moment
        </Link>
      ) : (
        <div className="app-card mb-5 grid gap-2 p-4 text-center">
          <p className="text-foreground text-sm font-bold">Been to the festival?</p>
          <p className="text-xs text-[var(--app-muted)]">
            Sign in to post your own photo. Browsing needs no account.
          </p>
          <Link
            href={`/sign-in?next=${encodeURIComponent(composeHref)}`}
            className="app-cta mt-1 flex w-full justify-center"
          >
            Sign in to post
          </Link>
        </div>
      )}

      {feed.posts.length === 0 ? (
        <div className="border-border mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-semibold">No moments yet</p>
          <p className="mt-1 text-sm text-[var(--app-muted)]">
            Be the first to share something from the festival.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 [&>li]:min-w-0">
          {feed.posts.map((post) => (
            <MomentCard
              key={post.id}
              post={post}
              baseHref={baseHref}
              tenantSlug={tenantSlug}
              eventSlug={eventSlug}
            />
          ))}
        </ul>
      )}
    </article>
  );
}
