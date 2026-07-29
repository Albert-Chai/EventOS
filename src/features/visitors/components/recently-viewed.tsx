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
      <h2 className="app-eyebrow">Recently viewed</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {cards.map((c) => (
          <li key={c.participationId} className="shrink-0">
            <Link
              href={`${baseHref}/${c.merchantSlug}`}
              className="app-card app-card-hover flex w-28 flex-col items-center gap-1.5 p-3 text-center"
            >
              <MediaImage
                src={c.logoUrl}
                alt=""
                width={48}
                height={48}
                fallback={c.merchantName}
                className="size-12 rounded-xl"
              />
              <span className="text-foreground line-clamp-2 text-xs font-semibold">
                {c.listingTitle || c.merchantName}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
