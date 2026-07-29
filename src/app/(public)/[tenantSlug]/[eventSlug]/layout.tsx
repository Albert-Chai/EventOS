import { BottomNav } from "@/features/visitors/components/bottom-nav";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";

/**
 * Per-event chrome. The bottom tab bar lives here rather than in the public root
 * layout because which tabs exist depends on which features the event has turned
 * on — and only this segment knows the event.
 *
 * That also keeps the bar honest: a tab whose page would 404 (vouchers or
 * moments switched off) is never rendered, and with six candidate tabs, hiding
 * the ones an event doesn't use is what keeps the bar usable at 390px.
 *
 * A missing/non-public event renders no nav at all; the page below still calls
 * `notFound()`, which is what produces the 404.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; eventSlug: string }>;
}) {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  const settings = event ? await getEventSettings(event.tenantId, event.id) : null;

  return (
    <>
      {children}
      {event ? (
        <BottomNav
          showMap={settings?.enableMaps ?? true}
          showVouchers={settings?.enableVouchers ?? false}
          showMoments={settings?.enableMoments ?? false}
          showFavourites={settings?.enableFavourites ?? true}
        />
      ) : null}
    </>
  );
}
