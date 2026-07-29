import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaImage } from "@/components/media/media-image";
import { Track } from "@/features/analytics/components/track";
import { formatPrice } from "@/features/merchants/format";
import { FavouriteButton } from "@/features/visitors/components/favourite-button";
import { RecordView } from "@/features/visitors/components/record-view";
import { ShareButton } from "@/features/visitors/components/share-button";
import { artStyle, brandStyle } from "@/features/visitors/theme";
import { findPublicBoothNumberForMerchant } from "@/server/db/repositories/booths.repository";
import {
  getEventBranding,
  getEventSettings,
} from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listFilesByIds } from "@/server/db/repositories/files.repository";
import { listPublicItemsForParticipation } from "@/server/db/repositories/listing-items.repository";
import { findPublicParticipationByMerchantSlug } from "@/server/db/repositories/participations.repository";
import { publicFileUrl } from "@/server/services/media.service";
import { listFavouriteParticipationIdsForRead } from "@/server/services/visitor.service";

type Params = {
  params: Promise<{ tenantSlug: string; eventSlug: string; merchantSlug: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug, merchantSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  const listing = await findPublicParticipationByMerchantSlug(event.id, merchantSlug);
  if (!listing) return { title: "Not found", robots: { index: false, follow: false } };

  const name = listing.listingTitle || listing.merchant.name;
  const index = event.visibility === "public";
  return {
    title: `${name} · ${event.name}`,
    description: listing.listingDescription ?? listing.merchant.description ?? undefined,
    robots: { index, follow: index },
  };
}

export default async function PublicMerchantPage({ params }: Params) {
  const { tenantSlug, eventSlug, merchantSlug } = await params;

  // Event visibility is enforced here; the participation read then requires the
  // listing to be approved and the merchant active.
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const listing = await findPublicParticipationByMerchantSlug(event.id, merchantSlug);
  if (!listing) notFound();

  const [items, settings, boothNumber, favourites, branding] = await Promise.all([
    listPublicItemsForParticipation(listing.participationId),
    getEventSettings(event.tenantId, event.id),
    findPublicBoothNumberForMerchant(event.id, merchantSlug),
    listFavouriteParticipationIdsForRead(event.id),
    getEventBranding(event.tenantId, event.id),
  ]);
  const showPrices = settings?.showMerchantPrices ?? true;
  const enableFavourites = settings?.enableFavourites ?? true;
  const favourited = favourites.has(listing.participationId);
  const displayName = listing.listingTitle || listing.merchant.name;
  const primary = branding?.primaryColor ?? "#e11d48";

  // Resolve media URLs for the merchant logo/cover and item photos.
  const fileIds = [
    listing.merchant.logoFileId,
    listing.merchant.coverFileId,
    ...items.map((i) => i.imageFileId),
  ].filter((id): id is string => Boolean(id));
  const files = fileIds.length ? await listFilesByIds(event.tenantId, fileIds) : [];
  const urlFor = (id: string | null) => {
    const file = id ? files.find((f) => f.id === id) : null;
    return file ? publicFileUrl(file) : null;
  };

  const coverUrl = urlFor(listing.merchant.coverFileId);
  const logoUrl = urlFor(listing.merchant.logoFileId);

  return (
    <article className="mx-auto w-full max-w-2xl pb-12" style={brandStyle(primary)}>
      <RecordView
        tenantSlug={event.tenantSlug}
        eventSlug={event.slug}
        merchantSlug={merchantSlug}
      />
      <Track
        name="merchant_viewed"
        tenantSlug={event.tenantSlug}
        eventSlug={event.slug}
        merchantSlug={merchantSlug}
      />

      {/* Cover — the merchant photo, or a colourful gradient with a back chip. */}
      <div className="relative">
        {coverUrl ? (
          <MediaImage
            src={coverUrl}
            alt=""
            width={1200}
            height={400}
            className="h-44 w-full object-cover sm:rounded-b-3xl"
          />
        ) : (
          <div
            className="app-art h-44 w-full text-6xl sm:rounded-b-3xl"
            style={artStyle(merchantSlug)}
            aria-hidden
          >
            🍜
          </div>
        )}
        <Link
          href={`/${event.tenantSlug}/${event.slug}`}
          aria-label={`Back to ${event.name}`}
          className="text-foreground absolute top-4 left-4 grid size-9 place-items-center rounded-full bg-white/85 shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          ←
        </Link>
      </div>

      <div className="px-4 sm:px-6">
        <div className="-mt-8 flex items-end gap-3">
          <MediaImage
            src={logoUrl}
            alt=""
            width={72}
            height={72}
            fallback={listing.merchant.name}
            className="size-18 shrink-0 rounded-2xl bg-white ring-4 ring-[var(--app-bg)]"
          />
        </div>
        <div className="mt-3 min-w-0">
          <h1 className="text-foreground text-3xl font-extrabold tracking-tight">{displayName}</h1>
          {listing.listingTitle && listing.listingTitle !== listing.merchant.name ? (
            <p className="text-muted-foreground text-sm">{listing.merchant.name}</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {enableFavourites ? (
            <FavouriteButton
              tenantSlug={event.tenantSlug}
              eventSlug={event.slug}
              merchantSlug={merchantSlug}
              initialFavourited={favourited}
              variant="button"
            />
          ) : null}
          <ShareButton
            title={displayName}
            text={listing.merchant.description ?? undefined}
            track={{ tenantSlug: event.tenantSlug, eventSlug: event.slug, merchantSlug }}
          />
          {boothNumber ? (
            <a
              href={`/${event.tenantSlug}/${event.slug}/map?booth=${encodeURIComponent(boothNumber)}`}
              className="border-border bg-card text-foreground hover:bg-secondary inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition-colors"
            >
              📍 Booth {boothNumber}
            </a>
          ) : null}
        </div>

        {listing.listingDescription || listing.merchant.description ? (
          <p className="text-muted-foreground mt-4 text-sm whitespace-pre-line">
            {listing.listingDescription || listing.merchant.description}
          </p>
        ) : null}

        {listing.merchant.website ? (
          <a
            href={listing.merchant.website}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[var(--brand)] underline-offset-4 hover:underline"
          >
            Visit website ↗
          </a>
        ) : null}

        <h2 className="app-eyebrow mt-8 block">Menu</h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No items listed.</p>
        ) : (
          <ul className="app-card mt-3 grid px-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-border flex justify-between gap-4 border-b py-3.5 last:border-0"
              >
                {item.imageFileId ? (
                  <MediaImage
                    src={urlFor(item.imageFileId)}
                    alt={item.name}
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-xl"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground font-bold tracking-tight">{item.name}</span>
                    {item.isHalal ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Halal
                      </span>
                    ) : null}
                    {item.availability === "sold_out" ? (
                      <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                        Sold out
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="text-muted-foreground mt-0.5 text-sm">{item.description}</p>
                  ) : null}
                  {item.dietaryTags && item.dietaryTags.length > 0 ? (
                    <p className="text-muted-foreground/70 mt-0.5 text-xs">
                      {item.dietaryTags.join(", ")}
                    </p>
                  ) : null}
                </div>
                {showPrices && item.price ? (
                  <span className="text-foreground shrink-0 text-right text-sm font-bold tabular-nums">
                    {item.promoPrice ? (
                      <>
                        <span className="text-[var(--brand)]">
                          {formatPrice(item.promoPrice, item.currency)}
                        </span>
                        <span className="text-muted-foreground ml-2 font-medium line-through">
                          {formatPrice(item.price, item.currency)}
                        </span>
                      </>
                    ) : (
                      formatPrice(item.price, item.currency)
                    )}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
