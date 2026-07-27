import Link from "next/link";

import { MediaImage } from "@/components/media/media-image";
import type { MerchantCardView } from "@/server/services/visitor.service";

/**
 * A horizontally-scrolling strip of the visitor's recently-viewed merchants
 * (spec §8.8). Renders nothing when empty, so the event home stays clean for a
 * first-time visitor.
 */
export function RecentlyViewed({
  cards,
  baseHref,
}: {
  cards: MerchantCardView[];
  baseHref: string;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
        Recently viewed
      </h2>
      <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        {cards.map((c) => (
          <li key={c.participationId} className="shrink-0">
            <Link
              href={`${baseHref}/${c.merchantSlug}`}
              className="neon-surface neon-surface-hover flex w-28 flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition-colors"
            >
              <MediaImage
                src={c.logoUrl}
                alt=""
                width={48}
                height={48}
                fallback={c.merchantName}
                className="size-12 rounded-xl"
              />
              <span className="line-clamp-2 text-xs font-semibold text-white">
                {c.listingTitle || c.merchantName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
