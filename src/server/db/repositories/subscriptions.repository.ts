import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { subscriptions, type NewSubscription, type Subscription } from "@/server/db/schema";

/**
 * A tenant's subscription (spec §8.2). One row per tenant; the plan change flow
 * reads it, then either inserts (first time) or updates it. Always keyed on the
 * `tenant_id` derived from context — never a client value.
 */

export async function findSubscriptionForTenant(tenantId: string): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

/**
 * Every subscription across all tenants. **Platform-admin only** — deliberately
 * unscoped (the platform-authority axis, §3.2); the caller must gate with
 * `requirePlatformAdmin`. Never reachable from a tenant user's path.
 */
export async function listAllSubscriptions(): Promise<Subscription[]> {
  return db.select().from(subscriptions);
}

export async function insertSubscription(input: NewSubscription): Promise<Subscription> {
  const [row] = await db.insert(subscriptions).values(input).returning();
  return row;
}

export async function updateSubscriptionForTenant(
  tenantId: string,
  patch: Partial<
    Pick<
      Subscription,
      | "planKey"
      | "status"
      | "currentPeriodStart"
      | "currentPeriodEnd"
      | "cancelAtPeriodEnd"
      | "externalRef"
      | "canceledAt"
    >
  >,
): Promise<Subscription | null> {
  const [row] = await db
    .update(subscriptions)
    .set(patch)
    .where(eq(subscriptions.tenantId, tenantId))
    .returning();
  return row ?? null;
}
