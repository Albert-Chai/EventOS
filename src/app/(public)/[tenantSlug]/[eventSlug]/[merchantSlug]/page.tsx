import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaImage } from "@/components/media/media-image";
import { Track } from "@/features/analytics/components/track";
import { formatPrice } from "@/features/merchants/format";
import { FavouriteButton } from "@/features/visitors/components/favourite-button";
import { RecordView } from "@/features/visitors/components/record-view";
import { ShareButton } from "@/features/visitors/components/share-button";
import { artStyle, brandStyle } from "@/features/visitors/neon";
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
  const primary = branding?.primaryColor ?? "#ff2d78";

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
            className="neon-art h-44 w-full text-6xl sm:rounded-b-3xl"
            style={artStyle(merchantSlug)}
            aria-hidden
          >
            🍜
          </div>
        )}
        <Link
          href={`/${event.tenantSlug}/${event.slug}`}
          aria-label={`Back to ${event.name}`}
          className="absolute top-4 left-4 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
        >
          ←
        </Link>
      </div>

      <div className="px-5 sm:px-8">
        <div className="-mt-8 flex items-end gap-3">
          <MediaImage
            src={logoUrl}
            alt=""
            width={72}
            height={72}
            fallback={listing.merchant.name}
            className="size-18 shrink-0 rounded-2xl ring-4 ring-[#1a0b2e]"
          />
        </div>
        <div className="mt-3 min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{displayName}</h1>
          {listing.listingTitle && listing.listingTitle !== listing.merchant.name ? (
            <p className="text-sm text-white/50">{listing.merchant.name}</p>
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
              className="inline-flex items-center gap-1.5 rounded-full border border-white/16 bg-white/8 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/14"
            >
              📍 Booth {boothNumber}
            </a>
          ) : null}
        </div>

        {listing.listingDescription || listing.merchant.description ? (
          <p className="mt-4 text-sm whitespace-pre-line text-white/80">
            {listing.listingDescription || listing.merchant.description}
          </p>
        ) : null}

        {listing.merchant.website ? (
          <a
            href={listing.merchant.website}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-[var(--neon-lime)] underline-offset-4 hover:underline"
          >
            Visit website ↗
          </a>
        ) : null}

        <h2 className="mt-8 text-[13px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
          Menu
        </h2>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-white/55">No items listed.</p>
        ) : (
          <ul className="mt-3 grid">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex justify-between gap-4 border-b border-white/10 py-3.5 last:border-0"
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
                    <span className="font-bold tracking-tight text-white">{item.name}</span>
                    {item.isHalal ? (
                      <span className="rounded-full bg-[var(--neon-mint)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--neon-mint)]">
                        Halal
                      </span>
                    ) : null}
                    {item.availability === "sold_out" ? (
                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                        Sold out
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-0.5 text-sm text-white/60">{item.description}</p>
                  ) : null}
                  {item.dietaryTags && item.dietaryTags.length > 0 ? (
                    <p className="mt-0.5 text-xs text-white/40">{item.dietaryTags.join(", ")}</p>
                  ) : null}
                </div>
                {showPrices && item.price ? (
                  <span className="shrink-0 text-right text-sm font-bold tabular-nums text-white">
                    {item.promoPrice ? (
                      <>
                        <span className="text-[var(--neon-lime)]">
                          {formatPrice(item.promoPrice, item.currency)}
                        </span>
                        <span className="ml-2 font-medium text-white/40 line-through">
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
