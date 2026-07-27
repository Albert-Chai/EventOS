import Link from "next/link";

import { MediaImage } from "@/components/media/media-image";
import { formatPrice } from "@/features/merchants/format";

import { FavouriteButton } from "./favourite-button";
import { artStyle } from "../neon";

/**
 * The one merchant card used across the directory, favourites, and search
 * results (spec §8.5: generic naming — a merchant is a stall, a booth, a package
 * depending on the event). The whole card links to the listing; the favourite
 * heart sits alongside the link (not nested inside it) so the markup stays valid.
 *
 * Night Market Neon: a glass surface with a colourful gradient thumbnail (its
 * hue derived from the slug so it's stable) when the merchant has no logo. The
 * directory supplies the price/halal/promo extras; the favourites and
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
  featured = false,
  showFavourite = true,
}: {
  card: MerchantCardData;
  /** `/${tenantSlug}/${eventSlug}` — the event home. */
  baseHref: string;
  tenantSlug: string;
  eventSlug: string;
  favourited: boolean;
  /** Currently featured (spec §8.7) — shows a badge. */
  featured?: boolean;
  showFavourite?: boolean;
}) {
  const title = card.listingTitle || card.merchantName;
  const price = card.minPrice ? formatPrice(card.minPrice, card.currency ?? "") : "";

  return (
    <div className="relative">
      <Link
        href={`${baseHref}/${card.merchantSlug}`}
        className="neon-surface neon-surface-hover flex gap-3 rounded-2xl p-3 transition-colors"
      >
        {card.logoUrl ? (
          <MediaImage
            src={card.logoUrl}
            alt=""
            width={56}
            height={56}
            fallback={card.merchantName}
            className="size-14 shrink-0 rounded-xl"
          />
        ) : (
          <span
            className="neon-art size-14 shrink-0 rounded-xl text-2xl"
            style={artStyle(card.merchantSlug)}
            aria-hidden
          >
            🍜
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {featured ? (
              <span className="shrink-0 rounded-full bg-[var(--neon-lime)] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[#14061f] uppercase">
                ★ Featured
              </span>
            ) : null}
            <span className="truncate font-bold tracking-tight text-white">{title}</span>
          </span>
          {card.categoryName ? (
            <span className="block text-xs text-[var(--neon-mint)]">{card.categoryName}</span>
          ) : null}
          {card.listingDescription ? (
            <span className="line-clamp-2 block text-sm text-white/55">
              {card.listingDescription}
            </span>
          ) : null}
          {card.boothNumber || card.hasHalal || card.hasPromo || price ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {card.boothNumber ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/80">
                  📍 {card.boothNumber}
                </span>
              ) : null}
              {card.hasHalal ? (
                <span className="rounded-full bg-[var(--neon-mint)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--neon-mint)]">
                  Halal
                </span>
              ) : null}
              {card.hasPromo ? (
                <span className="rounded-full bg-[var(--neon-lime)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--neon-lime)]">
                  Promo
                </span>
              ) : null}
              {price ? <span className="text-xs text-white/60">from {price}</span> : null}
            </div>
          ) : null}
        </div>
      </Link>
      {showFavourite ? (
        <div className="absolute top-2.5 right-2.5">
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
