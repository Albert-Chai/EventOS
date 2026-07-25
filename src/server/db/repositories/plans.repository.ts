import { asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { plans, type NewPlan, type Plan } from "@/server/db/schema";

/**
 * The plan catalog (spec §9). Read by the billing dashboard and `/platform/plans`;
 * written only by the seed (from `server/billing/plans.ts`). Not tenant-scoped —
 * it's the platform price list — but still reached only through this layer.
 */

export async function listActivePlans(): Promise<Plan[]> {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder));
}

export async function findPlan(key: string): Promise<Plan | null> {
  const [row] = await db.select().from(plans).where(eq(plans.key, key)).limit(1);
  return row ?? null;
}

/** Insert-or-update a plan by its key. Used by the seed to sync the code catalog. */
export async function upsertPlan(input: NewPlan): Promise<Plan> {
  const [row] = await db
    .insert(plans)
    .values(input)
    .onConflictDoUpdate({
      target: plans.key,
      set: {
        name: input.name,
        description: input.description ?? "",
        priceCents: input.priceCents ?? null,
        currency: input.currency ?? "MYR",
        billingInterval: input.billingInterval,
        limits: input.limits,
        features: input.features,
        analyticsRetentionDays: input.analyticsRetentionDays ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    })
    .returning();
  return row;
}
