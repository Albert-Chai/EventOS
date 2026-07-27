import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { getPlatformAnalytics } from "@/server/services/platform-metrics.service";

export const metadata: Metadata = {
  title: "Platform analytics",
  robots: { index: false, follow: false },
};

export default async function PlatformAnalyticsPage() {
  await requirePlatformAdminOrRedirect("/platform/analytics");
  const a = await getPlatformAnalytics();
  const maxName = a.byName[0]?.count ?? 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Engagement across every workspace, read live from the raw event log.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {a.totalEvents.toLocaleString()}
            </CardTitle>
            <CardDescription>Tracked events (all time)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {a.uniqueVisitors.toLocaleString()}
            </CardTitle>
            <CardDescription>Unique visitors</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Top events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {a.byName.length === 0 ? (
            <p className="text-muted-foreground text-sm">No analytics recorded yet.</p>
          ) : (
            <ul className="grid gap-2">
              {a.byName.map((n) => (
                <li key={n.name} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{n.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {n.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-foreground h-full rounded-full"
                      style={{ width: `${maxName > 0 ? Math.round((n.count / maxName) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            By workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {a.perTenant.length === 0 ? (
            <p className="text-muted-foreground text-sm">No analytics recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Unique visitors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.perTenant.map((t) => (
                  <TableRow key={t.tenantId}>
                    <TableCell className="font-medium">{t.tenantName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.totalEvents.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.uniqueVisitors.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
