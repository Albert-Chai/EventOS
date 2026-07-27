import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPlanPrice } from "@/server/billing/plans";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { platformAnalyticsTotals } from "@/server/db/repositories/analytics-events.repository";
import { platformInvoiceTotals } from "@/server/db/repositories/invoices.repository";
import { countTenants } from "@/server/db/repositories/tenants.repository";
import { countPlatformAdmins } from "@/server/db/repositories/platform-admins.repository";

export const metadata: Metadata = {
  title: "Platform overview",
  robots: { index: false, follow: false },
};

export default async function PlatformOverviewPage() {
  await requirePlatformAdminOrRedirect("/platform");
  // Sequential (not Promise.all): the shared transaction pooler stalls on a burst
  // of concurrent queries at the low dev/test connection cap.
  const tenantCount = await countTenants();
  const adminCount = await countPlatformAdmins();
  const revenue = await platformInvoiceTotals();
  const analytics = await platformAnalyticsTotals();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-muted-foreground text-sm">
          Manage organizer workspaces, administrators, and the audit trail.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {tenantCount}
            </CardTitle>
            <CardDescription>
              {tenantCount === 1 ? "Organizer workspace" : "Organizer workspaces"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {formatPlanPrice(revenue.amountCents, "MYR")}
            </CardTitle>
            <CardDescription>Simulated revenue</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {analytics.totalEvents.toLocaleString()}
            </CardTitle>
            <CardDescription>Tracked events</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl tabular-nums">
              {adminCount}
            </CardTitle>
            <CardDescription>
              {adminCount === 1 ? "Platform administrator" : "Platform administrators"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/platform/tenants/new" className={buttonVariants()}>
          Create a workspace
        </Link>
        <Link href="/platform/billing" className={buttonVariants({ variant: "outline" })}>
          Billing
        </Link>
        <Link href="/platform/usage" className={buttonVariants({ variant: "outline" })}>
          Usage
        </Link>
        <Link href="/platform/analytics" className={buttonVariants({ variant: "outline" })}>
          Analytics
        </Link>
      </div>
    </div>
  );
}
