import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { cn } from "@/lib/utils";
import { formatPlanPrice, type PlanDefinition, type PlanTier } from "@/server/billing/plans";

import { changePlanAction } from "../actions";
import { featureLabel } from "../format";

/**
 * The plan catalog with a (simulated) switch action per plan. The current plan is
 * highlighted and its button disabled. Switching posts to `changePlanAction`,
 * which records the subscription + a paid invoice + an audit line.
 */
export function PlanCards({
  plans,
  currentKey,
}: {
  plans: readonly PlanDefinition[];
  currentKey: PlanTier;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const isCurrent = plan.key === currentKey;
        const interval =
          plan.priceCents == null ? "" : plan.billingInterval === "per_event" ? " / event" : " / mo";
        return (
          <div
            key={plan.key}
            className={cn(
              "flex flex-col gap-3 rounded-lg border p-4",
              isCurrent && "border-foreground ring-foreground ring-1",
            )}
          >
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{plan.name}</h3>
                {isCurrent ? <Badge>Current</Badge> : null}
              </div>
              <p className="text-2xl font-bold">
                {formatPlanPrice(plan.priceCents, plan.currency)}
                <span className="text-muted-foreground text-sm font-normal">{interval}</span>
              </p>
              <p className="text-muted-foreground text-sm">{plan.description}</p>
            </div>

            <ul className="text-muted-foreground grid gap-0.5 text-xs">
              {plan.features.slice(0, 6).map((feature) => (
                <li key={feature}>✓ {featureLabel(feature)}</li>
              ))}
            </ul>

            <div className="mt-auto">
              {isCurrent ? (
                <Button type="button" variant="outline" size="sm" disabled className="w-full">
                  Current plan
                </Button>
              ) : (
                <form action={changePlanAction}>
                  <input type="hidden" name="planKey" value={plan.key} />
                  <SubmitButton
                    size="sm"
                    variant={plan.priceCents == null ? "outline" : "default"}
                    pendingText="Switching…"
                    className="w-full"
                  >
                    Switch to {plan.name}
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
