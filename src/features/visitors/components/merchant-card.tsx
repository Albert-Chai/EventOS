import Link from "next/link";

import { MediaImage } from "@/components/media/media-image";
import { formatPrice } from "@/features/merchants/format";
import { cn } from "@/lib/utils";

import { FavouriteButton } from "./favourite-button";
import { artStyle } from "../theme";

/**
 * The one merchant card used across the directory, favourites, and search
 * results (spec §8.5: generic naming — a merchant is a stall, a booth, a package
 * depending on the event). The whole card links to the listing; the favourite
 * heart sits alongside the link (not nested inside it) so the markup stays valid.
 *
 * A white app card with a colourful gradient thumbnail (its hue derived from the
 * slug so it's stable) when the merchant has no logo. The directory supplies the
 * price/halal/promo extras; the favourites and recent-views lists omit them, so
 * they're all optional.
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
        className="app-card app-card-hover flex gap-3 p-3"
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
            className="app-art size-14 shrink-0 rounded-xl text-2xl"
            style={artStyle(card.merchantSlug)}
            aria-hidden
          >
            🍜
          </span>
        )}
        {/* pr-7 keeps text clear of the favourite heart pinned at top-right */}
        <div className={cn("min-w-0 flex-1", showFavourite && "pr-7")}>
          {/* min-w-0 on the row is what lets `truncate` actually truncate: without
              it the nowrap title's min-content width props the card open and
              pushes the whole page sideways on a phone. */}
          <span className="flex min-w-0 items-center gap-1.5">
            {featured ? (
              <span className="shrink-0 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-[var(--brand-ink)] uppercase">
                ★ Featured
              </span>
            ) : null}
            <span className="text-foreground min-w-0 truncate font-bold tracking-tight">
              {title}
            </span>
          </span>
          {card.categoryName ? (
            <span className="block text-xs font-semibold text-[var(--brand)]">
              {card.categoryName}
            </span>
          ) : null}
          {card.listingDescription ? (
            <span className="text-muted-foreground line-clamp-2 block text-sm">
              {card.listingDescription}
            </span>
          ) : null}
          {card.boothNumber || card.hasHalal || card.hasPromo || price ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {card.boothNumber ? (
                <span className="border-border bg-secondary text-foreground/70 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  📍 {card.boothNumber}
                </span>
              ) : null}
              {card.hasHalal ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Halal
                </span>
              ) : null}
              {card.hasPromo ? <span className="app-pill px-2 py-0.5 text-[11px]">Promo</span> : null}
              {price ? <span className="text-muted-foreground text-xs">from {price}</span> : null}
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
