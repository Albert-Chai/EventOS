import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { featureLabel } from "@/features/billing/format";
import { formatPlanPrice, type PlanFeature } from "@/server/billing/plans";
import { listActivePlans } from "@/server/db/repositories/plans.repository";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Plans",
  robots: { index: false, follow: false },
};

/**
 * The plan catalog as seeded into the `plans` table (spec §17 `/platform/plans`).
 * Read-only for now — plans are defined in `server/billing/plans.ts` and synced by
 * the seed; editing them from here is a later addition.
 */
export default async function PlatformPlansPage() {
  await requirePlatformAdminOrRedirect("/platform/plans");
  const plans = await listActivePlans();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="text-muted-foreground text-sm">
          The subscription catalog. Defined in code and seeded into the database.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle as="h2" className="text-base">
                  {plan.name}
                </CardTitle>
                <span className="font-semibold">
                  {formatPlanPrice(plan.priceCents, plan.currency)}
                </span>
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="flex flex-wrap gap-1">
                {(plan.features as PlanFeature[]).map((feature) => (
                  <Badge key={feature} variant="secondary">
                    {featureLabel(feature)}
                  </Badge>
                ))}
              </div>
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {Object.entries(plan.limits).map(([metric, value]) => (
                  <div key={metric} className="flex justify-between gap-2">
                    <dt>{metric}</dt>
                    <dd className="tabular-nums">{value != null ? value.toLocaleString() : "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
