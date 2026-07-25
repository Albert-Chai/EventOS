import {
  DEFAULT_PLAN_KEY,
  getPlan,
  PLANS,
  type PlanDefinition,
} from "@/server/billing/plans";
import { findSubscriptionForTenant } from "@/server/db/repositories/subscriptions.repository";
import type { Subscription } from "@/server/db/schema";

/**
 * Resolves a tenant's current plan (spec §22). The plan *definition* — limits and
 * features — always comes from code (`server/billing/plans.ts`), keyed by the
 * subscription's `plan_key`; the `plans` table is the catalog the UI renders. A
 * tenant with no subscription sits on the default (Starter) plan.
 */
export async function getTenantPlan(
  tenantId: string,
): Promise<{ plan: PlanDefinition; subscription: Subscription | null }> {
  const subscription = await findSubscriptionForTenant(tenantId);
  const key = subscription?.planKey ?? DEFAULT_PLAN_KEY;
  const plan = getPlan(key) ?? PLANS[DEFAULT_PLAN_KEY];
  return { plan, subscription };
}
