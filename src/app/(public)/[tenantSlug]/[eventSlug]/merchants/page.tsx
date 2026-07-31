import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdSlot } from "@/features/ads/components/ad-slot";
import { Track } from "@/features/analytics/components/track";
import { FilterBar } from "@/features/visitors/components/filter-bar";
import { MerchantCard } from "@/features/visitors/components/merchant-card";
import { SearchBar } from "@/features/visitors/components/search-bar";
import { hasActiveFilters, parseDirectoryParams } from "@/features/visitors/filters";
import { brandStyle } from "@/features/visitors/theme";
import {
  getEventBranding,
  getEventSettings,
} from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { getDirectoryFacets, searchDirectory } from "@/server/services/directory.service";
import { listFeaturedParticipationIds } from "@/server/services/featured.service";
import { listFavouriteParticipationIdsForRead } from "@/server/services/visitor.service";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };
type Search = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    zone?: string;
    halal?: string;
    promo?: string;
  }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `Merchants · ${event.name}`,
    description: `Browse and search merchants at ${event.name}.`,
    robots: { index: event.visibility === "public", follow: true },
  };
}

export default async function DirectoryPage({ params, searchParams }: Params & Search) {
  const { tenantSlug, eventSlug } = await params;
  const sp = await searchParams;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  // Parsed once: the query, the empty-state copy, and the analytics event must
  // all agree on which filters actually applied.
  const filters = parseDirectoryParams(sp);

  const [results, facets, settings, favourites, featured, branding] = await Promise.all([
    searchDirectory(event.id, filters),
    getDirectoryFacets(event.id),
    getEventSettings(event.tenantId, event.id),
    listFavouriteParticipationIdsForRead(event.id),
    listFeaturedParticipationIds(event.id),
    getEventBranding(event.tenantId, event.id),
  ]);

  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const primary = branding?.primaryColor ?? "#e11d48";
  const showFavourite = settings?.enableFavourites ?? true;
  const isSearching = hasActiveFilters(sp);

  const searchQuery = sp.q?.trim();
  // From the parsed filters, not the raw params: a malformed id is dropped
  // before the query, so logging it as an applied filter would put a number in
  // the analytics log that never affected a result.
  const activeFilters = [
    filters.categoryId && "category",
    filters.zoneId && "zone",
    filters.halal && "halal",
    filters.promoOnly && "promo",
  ].filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8" style={brandStyle(primary)}>
      <Track name="merchant_list_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />
      {searchQuery ? (
        <Track
          name="search_performed"
          tenantSlug={event.tenantSlug}
          eventSlug={event.slug}
          props={{ q: searchQuery, results: results.length }}
        />
      ) : null}
      {activeFilters.length > 0 ? (
        <Track
          name="filter_applied"
          tenantSlug={event.tenantSlug}
          eventSlug={event.slug}
          props={{ filters: activeFilters.join(",") }}
        />
      ) : null}
      <div className="mb-4 grid gap-1">
        <Link
          href={baseHref}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          ← {event.name}
        </Link>
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">Stalls</h1>
      </div>

      <div className="grid gap-3">
        <SearchBar />
        <FilterBar facets={facets} />
      </div>

      <AdSlot
        slot="directory_inline"
        tenantSlug={tenantSlug}
        eventSlug={eventSlug}
        className="mt-4"
      />

      <p className="text-muted-foreground mt-4 text-sm" aria-live="polite">
        <span className="font-bold text-[var(--brand)]">{results.length}</span>{" "}
        {results.length === 1 ? "stall" : "stalls"}
        {isSearching ? " match your search" : ""}
      </p>

      {results.length === 0 ? (
        <div className="border-border mt-6 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-semibold">No stalls found</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {isSearching
              ? "Try a different search or clear the filters."
              : "Listings will appear here as they’re approved."}
          </p>
        </div>
      ) : (
        // [&>li]:min-w-0 — grid items default to min-width:auto, so a card's
        // intrinsic width would otherwise push the page sideways on a phone.
        <ul className="mt-4 grid gap-2 [&>li]:min-w-0">
          {results.map((card) => (
            <li key={card.participationId}>
              <MerchantCard
                card={card}
                baseHref={baseHref}
                tenantSlug={event.tenantSlug}
                eventSlug={event.slug}
                favourited={favourites.has(card.participationId)}
                featured={featured.has(card.participationId)}
                showFavourite={showFavourite}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
