import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MerchantCard } from "@/features/visitors/components/merchant-card";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listFavouritesForRead } from "@/server/services/visitor.service";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  // Personal to the visitor's device — never index.
  return {
    title: `Your favourites · ${event.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function FavouritesPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const settings = await getEventSettings(event.tenantId, event.id);
  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  if (settings && !settings.enableFavourites) {
    return (
      <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
        <Link href={baseHref} className="text-muted-foreground text-sm hover:underline">
          ← {event.name}
        </Link>
        <p className="text-muted-foreground mt-6 text-sm">
          Favourites aren’t enabled for this event.
        </p>
      </article>
    );
  }

  const cards = await listFavouritesForRead(event.id);

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <div className="mb-4 grid gap-1">
        <Link href={baseHref} className="text-muted-foreground text-sm hover:underline">
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Your favourites</h1>
        <p className="text-muted-foreground text-sm">Saved on this device.</p>
      </div>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Nothing saved yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Tap the heart on any merchant to save it here for quick access.
          </p>
          <Link
            href={`${baseHref}/merchants`}
            className="mt-4 inline-block text-sm underline underline-offset-4"
          >
            Browse merchants →
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {cards.map((card) => (
            <li key={card.participationId}>
              <MerchantCard
                card={card}
                baseHref={baseHref}
                tenantSlug={event.tenantSlug}
                eventSlug={event.slug}
                favourited
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
