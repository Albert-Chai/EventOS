import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RangeTabs, StatCard } from "@/features/analytics/components/analytics-widgets";
import { QrPanel } from "@/features/analytics/components/qr-panel";
import { formatCount, resolveDays } from "@/features/analytics/format";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import { isPublicStatus, type EventStatus } from "@/server/events/status";
import { getMerchantAnalytics, resolveRange } from "@/server/services/analytics.service";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default async function MerchantAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ merchantId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { merchantId } = await params;
  const { days: daysRaw } = await searchParams;
  const base = `/merchant/${merchantId}/analytics`;
  const ctx = await requireMerchantMemberOrRedirect(merchantId, base);

  const days = resolveDays(daysRaw);
  const [a, participations] = await Promise.all([
    getMerchantAnalytics(ctx.merchant.tenantId, merchantId, resolveRange(days)),
    listParticipationsForMerchant(merchantId),
  ]);

  // A listing QR only resolves when the merchant is approved and the event public.
  const liveListings = participations.filter(
    (p) => p.approvalStatus === "approved" && isPublicStatus(p.eventStatus as EventStatus),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href={`/merchant/${merchantId}`} className="text-muted-foreground text-sm hover:underline">
          ← {ctx.merchant.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <div className="flex items-center gap-2">
            <RangeTabs current={days} baseHref={base} />
            <a
              href={`${base}/export?days=${days}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Export CSV
            </a>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          How visitors engaged with your listings over the last {days} days.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Listing views" value={a.totals.listingViews} />
        <StatCard label="Unique visitors" value={a.totals.uniqueVisitors} />
        <StatCard label="Favourites" value={a.totals.favourites} />
        <StatCard label="QR scans" value={a.totals.qrScans} />
        <StatCard label="Shares" value={a.totals.shares} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            By event
          </CardTitle>
          <CardDescription>Engagement per event you take part in.</CardDescription>
        </CardHeader>
        <CardContent>
          {a.perEvent.length === 0 ? (
            <p className="text-muted-foreground text-sm">No engagement yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 text-right font-medium">Views</th>
                    <th className="py-2 pr-3 text-right font-medium">Favourites</th>
                    <th className="py-2 text-right font-medium">QR scans</th>
                  </tr>
                </thead>
                <tbody>
                  {a.perEvent.map((e) => (
                    <tr key={e.eventId} className="border-b last:border-0">
                      <td className="py-2 pr-3">{e.eventName}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCount(e.listingViews)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatCount(e.favourites)}</td>
                      <td className="py-2 text-right tabular-nums">{formatCount(e.qrScans)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {liveListings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Listing QR codes
            </CardTitle>
            <CardDescription>
              Print or share these to bring visitors straight to your listing. Every scan is tracked.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {liveListings.map((p) => (
              <div key={p.id} className="grid gap-2">
                <p className="text-sm font-medium">{p.eventName}</p>
                <QrPanel kind="merchant" merchantId={merchantId} participationId={p.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Coming soon
          </CardTitle>
          <CardDescription>
            Product views, voucher claims &amp; redemptions, and search appearances arrive with the
            vouchers module.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
