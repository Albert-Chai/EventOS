import { env } from "@/config/env";
import { AppHeader } from "@/features/visitors/components/app-header";
import { BottomNav } from "@/features/visitors/components/bottom-nav";
import { visitorTabs } from "@/features/visitors/nav-tabs";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";

/**
 * Per-event chrome. Both navs live here rather than in the public root layout
 * because which tabs exist depends on which features the event has turned on —
 * and only this segment knows the event.
 *
 * That also keeps them honest: a tab whose page would 404 (vouchers or moments
 * switched off) is never rendered, and with six candidate tabs, hiding the ones
 * an event doesn't use is what keeps the bar usable at 390px.
 *
 * One list, two renderings: the bottom bar below `lg`, the header strip above it
 * (`nav-tabs.ts`). `pb-24` clears the fixed bottom bar and is dropped at `lg`,
 * where there is no bar to clear.
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

  const tabs = event
    ? visitorTabs({
        map: settings?.enableMaps ?? true,
        vouchers: settings?.enableVouchers ?? false,
        moments: settings?.enableMoments ?? false,
        favourites: settings?.enableFavourites ?? true,
      })
    : [];

  return (
    <>
      <AppHeader appName={env.NEXT_PUBLIC_APP_NAME} tabs={tabs} />
      <main className="flex-1 pb-24 lg:pb-10">{children}</main>
      <BottomNav tabs={tabs} />
    </>
  );
}
