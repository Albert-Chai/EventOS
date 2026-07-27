import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPlanPrice } from "@/server/billing/plans";
import { toDateKey } from "@/lib/date-keys";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { getPlatformBilling } from "@/server/services/platform-metrics.service";

export const metadata: Metadata = {
  title: "Platform billing",
  robots: { index: false, follow: false },
};

export default async function PlatformBillingPage() {
  await requirePlatformAdminOrRedirect("/platform/billing");
  const billing = await getPlatformBilling();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Plans, subscriptions, and revenue across every workspace.{" "}
          <span className="font-medium">Billing is simulated</span> — no payment is taken.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl">
              {formatPlanPrice(billing.revenueCents, "MYR")}
            </CardTitle>
            <CardDescription>Simulated revenue (paid invoices)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl">
              {billing.payingCount}
            </CardTitle>
            <CardDescription>
              {billing.payingCount === 1 ? "Paying workspace" : "Paying workspaces"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl">
              {billing.paidInvoiceCount}
            </CardTitle>
            <CardDescription>
              {billing.paidInvoiceCount === 1 ? "Paid invoice" : "Paid invoices"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Plan distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {billing.distribution.map((d) => (
              <Badge key={d.key} variant="secondary" className="text-sm">
                {d.name}: <span className="ml-1 font-semibold tabular-nums">{d.count}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Workspaces
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Renews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {billing.rows.map((r) => (
                <TableRow key={r.tenantId}>
                  <TableCell className="font-medium">
                    {r.tenantName}
                    {r.suspended ? (
                      <Badge variant="destructive" className="ml-2">
                        Suspended
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground block text-xs">{r.tenantSlug}</span>
                  </TableCell>
                  <TableCell>{r.planName}</TableCell>
                  <TableCell>
                    <Badge variant={r.paying ? "default" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPlanPrice(r.priceCents, r.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {r.periodEnd ? toDateKey(r.periodEnd) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Recent invoices
          </CardTitle>
          <CardDescription>Newest simulated invoices across all workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {billing.recentInvoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {billing.recentInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                    <TableCell>{inv.tenantName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPlanPrice(inv.amountCents, inv.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {toDateKey(inv.issuedAt)}
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
