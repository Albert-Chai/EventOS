import { MediaImage } from "@/components/media/media-image";
import type { AdSlot as AdSlotName } from "@/server/ads/slots";
import { selectAdForPublicSlot } from "@/server/services/ads.service";

import { AdImpression } from "./ad-impression";

/**
 * A sponsor ad space on the visitor app (docs/phase-9-sponsor-ads-plan.md §6).
 *
 * A Server Component: it selects one live booking for the slot (weighted
 * rotation across sponsors) and renders it. Renders **nothing at all** when the
 * slot is unsold — no placeholder, no reserved space, so an event without
 * sponsors looks exactly as it does today.
 *
 * Every ad is visibly labelled "Sponsored" regardless of the creative, and the
 * click always goes through our own `/s/[id]` redirect rather than the sponsor's
 * URL, so the destination is never rendered raw into the page.
 */
export async function AdSlot({
  slot,
  tenantSlug,
  eventSlug,
  className,
}: {
  slot: AdSlotName;
  tenantSlug: string;
  eventSlug: string;
  className?: string;
}) {
  const ad = await selectAdForPublicSlot(tenantSlug, eventSlug, slot);
  if (!ad) return null;

  const creative = (
    <>
      <MediaImage
        src={ad.imageUrl}
        alt={ad.altText}
        width={1200}
        height={400}
        className="h-auto w-full"
      />
      <span className="text-muted-foreground absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-sm">
        Sponsored
      </span>
    </>
  );

  return (
    <aside
      className={`app-card relative overflow-hidden ${className ?? ""}`}
      aria-label={`Sponsored by ${ad.sponsorName}`}
    >
      <AdImpression bookingId={ad.bookingId} />
      {ad.href ? (
        <a
          href={ad.href}
          target="_blank"
          rel="noopener sponsored"
          className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
        >
          {creative}
        </a>
      ) : (
        creative
      )}
    </aside>
  );
}
