import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Track } from "@/features/analytics/components/track";
import { FilterBar } from "@/features/visitors/components/filter-bar";
import { MerchantCard } from "@/features/visitors/components/merchant-card";
import { SearchBar } from "@/features/visitors/components/search-bar";
import { hasActiveFilters, parseDirectoryParams } from "@/features/visitors/filters";
import { brandStyle } from "@/features/visitors/neon";
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

  const [results, facets, settings, favourites, featured, branding] = await Promise.all([
    searchDirectory(event.id, parseDirectoryParams(sp)),
    getDirectoryFacets(event.id),
    getEventSettings(event.tenantId, event.id),
    listFavouriteParticipationIdsForRead(event.id),
    listFeaturedParticipationIds(event.id),
    getEventBranding(event.tenantId, event.id),
  ]);

  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const primary = branding?.primaryColor ?? "#ff2d78";
  const showFavourite = settings?.enableFavourites ?? true;
  const isSearching = hasActiveFilters(sp);

  const searchQuery = sp.q?.trim();
  const activeFilters = (["category", "zone", "halal", "promo"] as const).filter((k) => sp[k]);

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
        <Link href={baseHref} className="text-sm text-white/55 transition-colors hover:text-white">
          ← {event.name}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Stalls</h1>
      </div>

      <div className="grid gap-3">
        <SearchBar />
        <FilterBar facets={facets} />
      </div>

      <p className="mt-4 text-sm text-white/55" aria-live="polite">
        <span className="font-bold text-[var(--neon-lime)]">{results.length}</span>{" "}
        {results.length === 1 ? "stall" : "stalls"}
        {isSearching ? " match your search" : ""}
      </p>

      {results.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 p-8 text-center">
          <p className="text-sm font-semibold text-white">No stalls found</p>
          <p className="mt-1 text-sm text-white/55">
            {isSearching
              ? "Try a different search or clear the filters."
              : "Listings will appear here as they’re approved."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
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
