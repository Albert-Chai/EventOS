import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FilterBar } from "@/features/visitors/components/filter-bar";
import { MerchantCard } from "@/features/visitors/components/merchant-card";
import { SearchBar } from "@/features/visitors/components/search-bar";
import { hasActiveFilters, parseDirectoryParams } from "@/features/visitors/filters";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { getDirectoryFacets, searchDirectory } from "@/server/services/directory.service";
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

  const [results, facets, settings, favourites] = await Promise.all([
    searchDirectory(event.id, parseDirectoryParams(sp)),
    getDirectoryFacets(event.id),
    getEventSettings(event.tenantId, event.id),
    listFavouriteParticipationIdsForRead(event.id),
  ]);

  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const showFavourite = settings?.enableFavourites ?? true;
  const isSearching = hasActiveFilters(sp);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <div className="mb-4 grid gap-1">
        <Link href={baseHref} className="text-muted-foreground text-sm hover:underline">
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
      </div>

      <div className="grid gap-3">
        <SearchBar />
        <FilterBar facets={facets} />
      </div>

      <p className="text-muted-foreground mt-4 text-sm" aria-live="polite">
        {results.length} {results.length === 1 ? "merchant" : "merchants"}
        {isSearching ? " match your search" : ""}
      </p>

      {results.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No merchants found</p>
          <p className="text-muted-foreground mt-1 text-sm">
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
                showFavourite={showFavourite}
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
