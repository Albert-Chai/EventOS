import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceList } from "@/features/billing/components/invoice-list";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { UsagePanel } from "@/features/billing/components/usage-panel";
import { formatPlanPrice, PLAN_LIST } from "@/server/billing/plans";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { listInvoices } from "@/server/services/billing.service";
import { getTenantPlan } from "@/server/services/plan.service";
import { computeUsage } from "@/server/services/usage.service";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

export default async function BillingPage() {
  const ctx = await requirePermissionOrRedirect("tenant.manage_billing", "/dashboard/billing");

  const { plan, subscription } = await getTenantPlan(ctx.tenant.id);
  const [usage, invoices] = await Promise.all([
    computeUsage(ctx.tenant.id, plan),
    listInvoices(ctx.tenant.id),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Manage {ctx.tenant.name}&apos;s plan, usage, and invoices.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle as="h2" className="text-base">
                {plan.name} plan
              </CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">
                {formatPlanPrice(plan.priceCents, plan.currency)}
              </p>
              <Badge variant={subscription ? "default" : "secondary"}>
                {subscription ? subscription.status : "default plan"}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Plans
          </CardTitle>
          <CardDescription>
            Switching plans is simulated in this environment — no payment is taken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanCards plans={PLAN_LIST} currentKey={plan.key} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Usage
          </CardTitle>
          <CardDescription>
            Your usage against the {plan.name} plan&apos;s limits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsagePanel usage={usage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceList invoices={invoices} />
        </CardContent>
      </Card>
    </div>
  );
}
