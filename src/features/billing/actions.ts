"use server";

import { revalidatePath } from "next/cache";

import { isPlanTier } from "@/server/billing/plans";
import { requirePermission } from "@/server/policies/require-user";
import { changePlan } from "@/server/services/billing.service";

/**
 * Billing actions. Gated by `tenant.manage_billing` via `requirePermission` (§14).
 * The plan switch is simulated — `changePlan` records the subscription + invoice +
 * audit; no external payment (see docs/phase-6-plan.md §2).
 */
export async function changePlanAction(formData: FormData): Promise<void> {
  const planKey = formData.get("planKey")?.toString() ?? "";
  if (!isPlanTier(planKey)) return;

  const ctx = await requirePermission("tenant.manage_billing");
  await changePlan(ctx, planKey);
  revalidatePath("/dashboard/billing");
}
