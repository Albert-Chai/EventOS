import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/features/merchants/format";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicItemsForParticipation } from "@/server/db/repositories/listing-items.repository";
import { findPublicParticipationByMerchantSlug } from "@/server/db/repositories/participations.repository";

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

  const [items, settings] = await Promise.all([
    listPublicItemsForParticipation(listing.participationId),
    getEventSettings(event.tenantId, event.id),
  ]);
  const showPrices = settings?.showMerchantPrices ?? true;

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <Link
        href={`/${event.tenantSlug}/${event.slug}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {event.name}
      </Link>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        {listing.listingTitle || listing.merchant.name}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">{listing.merchant.name}</p>

      {listing.listingDescription || listing.merchant.description ? (
        <p className="mt-4 text-sm whitespace-pre-line">
          {listing.listingDescription || listing.merchant.description}
        </p>
      ) : null}

      {listing.merchant.website ? (
        <a
          href={listing.merchant.website}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm underline underline-offset-4"
        >
          Visit website ↗
        </a>
      ) : null}

      <h2 className="mt-8 text-lg font-semibold">Menu</h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-sm">No items listed.</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 border-b py-2 last:border-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  {item.isHalal ? <Badge variant="secondary">Halal</Badge> : null}
                  {item.availability === "sold_out" ? (
                    <Badge variant="outline">Sold out</Badge>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="text-muted-foreground text-sm">{item.description}</p>
                ) : null}
                {item.dietaryTags && item.dietaryTags.length > 0 ? (
                  <p className="text-muted-foreground text-xs">{item.dietaryTags.join(", ")}</p>
                ) : null}
              </div>
              {showPrices && item.price ? (
                <span className="shrink-0 text-sm">
                  {item.promoPrice ? (
                    <>
                      <span className="font-medium">
                        {formatPrice(item.promoPrice, item.currency)}
                      </span>{" "}
                      <span className="text-muted-foreground line-through">
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
    </article>
  );
}
