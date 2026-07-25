import Link from "next/link";

import { MediaImage } from "@/components/media/media-image";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/features/merchants/format";

import { FavouriteButton } from "./favourite-button";

/**
 * The one merchant card used across the directory, favourites, and search
 * results (spec §8.5: generic naming — a merchant is a stall, a booth, a package
 * depending on the event). The whole card links to the listing; the favourite
 * heart sits alongside the link (not nested inside it) so the markup stays valid.
 *
 * The directory supplies the price/halal/promo extras; the favourites and
 * recent-views lists omit them, so they're all optional.
 */
export type MerchantCardData = {
  participationId: string;
  merchantSlug: string;
  merchantName: string;
  listingTitle: string | null;
  listingDescription: string | null;
  categoryName: string | null;
  logoUrl: string | null;
  boothNumber: string | null;
  hasHalal?: boolean;
  hasPromo?: boolean;
  minPrice?: string | null;
  currency?: string | null;
};

export function MerchantCard({
  card,
  baseHref,
  tenantSlug,
  eventSlug,
  favourited,
  showFavourite = true,
}: {
  card: MerchantCardData;
  /** `/${tenantSlug}/${eventSlug}` — the event home. */
  baseHref: string;
  tenantSlug: string;
  eventSlug: string;
  favourited: boolean;
  showFavourite?: boolean;
}) {
  const title = card.listingTitle || card.merchantName;
  const price = card.minPrice ? formatPrice(card.minPrice, card.currency ?? "") : "";

  return (
    <div className="relative">
      <Link
        href={`${baseHref}/${card.merchantSlug}`}
        className="hover:bg-muted/50 flex gap-3 rounded-lg border p-3 transition-colors"
      >
        <MediaImage
          src={card.logoUrl}
          alt=""
          width={48}
          height={48}
          fallback={card.merchantName}
          className="size-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {card.categoryName ? (
            <span className="text-muted-foreground block text-xs">{card.categoryName}</span>
          ) : null}
          {card.listingDescription ? (
            <span className="text-muted-foreground line-clamp-2 block text-sm">
              {card.listingDescription}
            </span>
          ) : null}
          {card.boothNumber || card.hasHalal || card.hasPromo || price ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {card.boothNumber ? <Badge variant="outline">📍 {card.boothNumber}</Badge> : null}
              {card.hasHalal ? <Badge variant="secondary">Halal</Badge> : null}
              {card.hasPromo ? <Badge variant="secondary">Promo</Badge> : null}
              {price ? (
                <span className="text-muted-foreground text-xs">from {price}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
      {showFavourite ? (
        <div className="absolute top-2 right-2">
          <FavouriteButton
            tenantSlug={tenantSlug}
            eventSlug={eventSlug}
            merchantSlug={card.merchantSlug}
            initialFavourited={favourited}
          />
        </div>
      ) : null}
    </div>
  );
}
