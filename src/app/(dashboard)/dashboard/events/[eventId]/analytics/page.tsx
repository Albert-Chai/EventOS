import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarList,
  DailySeries,
  RangeTabs,
  StatCard,
} from "@/features/analytics/components/analytics-widgets";
import { QrPanel } from "@/features/analytics/components/qr-panel";
import { deviceLabel, resolveDays, sourceLabel } from "@/features/analytics/format";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { getEventAnalytics, resolveRange } from "@/server/services/analytics.service";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export default async function EventAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { eventId } = await params;
  const { days: daysRaw } = await searchParams;
  const base = `/dashboard/events/${eventId}/analytics`;
  const ctx = await requirePermissionOrRedirect("analytics.view", base);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const days = resolveDays(daysRaw);
  const range = resolveRange(days);
  const a = await getEventAnalytics(ctx.tenant.id, eventId, range);
  const canExport = ctx.permissions.has("analytics.export");

  const hasData = a.totals.totalEvents > 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <div className="flex items-center gap-2">
            <RangeTabs current={days} baseHref={base} />
            {canExport ? (
              <a
                href={`${base}/export?days=${days}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Export CSV
              </a>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Engagement over the last {days} days.</p>
      </div>

      {!hasData ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No activity yet
            </CardTitle>
            <CardDescription>
              Once visitors open this event&apos;s public pages, their engagement appears here.
              Metrics are computed live from the raw event log.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Unique visitors" value={a.totals.uniqueVisitors} />
        <StatCard label="Event views" value={a.totals.eventViews} />
        <StatCard label="Merchant views" value={a.totals.merchantViews} />
        <StatCard label="Searches" value={a.totals.searches} />
        <StatCard label="Map opens" value={a.totals.mapOpens} />
        <StatCard label="Favourites" value={a.totals.favourites} />
        <StatCard label="QR scans" value={a.totals.qrScans} />
        <StatCard label="Shares" value={a.totals.shares} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Daily activity
          </CardTitle>
          <CardDescription>Total events per day; hover for unique visitors.</CardDescription>
        </CardHeader>
        <CardContent>
          <DailySeries series={a.series} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Top merchants
            </CardTitle>
            <CardDescription>By listing views.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={a.topMerchants.map((m) => ({ label: m.merchantName, value: m.views }))}
              emptyLabel="No merchant views yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Top categories
            </CardTitle>
            <CardDescription>By listing views.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={a.topCategories.map((c) => ({ label: c.category, value: c.views }))}
              emptyLabel="No category data yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Top searches
            </CardTitle>
            <CardDescription>What visitors looked for.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              rows={a.topKeywords.map((k) => ({ label: k.keyword, value: k.count }))}
              emptyLabel="No searches yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Devices &amp; sources
            </CardTitle>
            <CardDescription>How visitors reached the event.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                Device
              </p>
              <BarList
                rows={a.devices.map((d) => ({ label: deviceLabel(d.key), value: d.count }))}
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                Traffic source
              </p>
              <BarList
                rows={a.sources.map((s) => ({ label: sourceLabel(s.key), value: s.count }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Event QR code
          </CardTitle>
          <CardDescription>
            Print or share this to bring visitors to the event homepage. Every scan is tracked and
            the destination stays editable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QrPanel kind="event" eventId={eventId} />
        </CardContent>
      </Card>
    </div>
  );
}
