import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsagePanel } from "@/features/billing/components/usage-panel";
import { formatBytes } from "@/features/billing/format";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { getPlatformUsage } from "@/server/services/platform-metrics.service";

export const metadata: Metadata = {
  title: "Platform usage",
  robots: { index: false, follow: false },
};

export default async function PlatformUsagePage() {
  await requirePlatformAdminOrRedirect("/platform/usage");
  const usage = await getPlatformUsage();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground text-sm">
          Every workspace&apos;s hard-limit metrics against its plan.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {usage.totalEvents.toLocaleString()}
            </CardTitle>
            <CardDescription>Active events (all workspaces)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {formatBytes(usage.totalStorageBytes)}
            </CardTitle>
            <CardDescription>Storage used (all workspaces)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle
              as="h2"
              className={`text-3xl tabular-nums ${usage.tenantsOverLimit > 0 ? "text-red-600" : ""}`}
            >
              {usage.tenantsOverLimit}
            </CardTitle>
            <CardDescription>
              {usage.tenantsOverLimit === 1 ? "Workspace over a limit" : "Workspaces over a limit"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {usage.rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">No workspaces yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {usage.rows.map((row) => (
            <Card key={row.tenantId}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle as="h2" className="text-base">
                    {row.tenantName}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{row.planName}</Badge>
                    {row.over > 0 ? (
                      <Badge variant="destructive">{row.over} over</Badge>
                    ) : row.warn > 0 ? (
                      <Badge variant="outline" className="text-amber-600">
                        {row.warn} near
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <UsagePanel usage={row.metrics} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
