import { AppError } from "@/lib/api/errors";
import { getPlan } from "@/server/billing/plans";
import type { TenantScopedContext } from "@/server/context";
import {
  countInvoicesForTenant,
  insertInvoice,
  listInvoicesForTenant,
} from "@/server/db/repositories/invoices.repository";
import {
  findSubscriptionForTenant,
  insertSubscription,
  updateSubscriptionForTenant,
} from "@/server/db/repositories/subscriptions.repository";
import type { Invoice, Subscription } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Billing (spec §22, §34). The upgrade flow is **simulated** — no external
 * payment. A plan change updates the tenant's single subscription, records a
 * (paid) invoice snapshotting the charge, and audits the change. Real Stripe
 * Checkout + webhooks are a deferred follow-up; `external_ref` is reserved for
 * the Stripe ids.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeInvoiceNumber(tenantId: string, seq: number): string {
  return `INV-${tenantId.slice(0, 8).toUpperCase()}-${String(seq).padStart(4, "0")}`;
}

export async function changePlan(
  ctx: TenantScopedContext,
  planKey: string,
): Promise<{ subscription: Subscription; invoice: Invoice | null; changed: boolean }> {
  const plan = getPlan(planKey);
  if (!plan) throw new AppError("VALIDATION_ERROR", { message: "Unknown plan." });

  const existing = await findSubscriptionForTenant(ctx.tenant.id);
  const fromKey = existing?.planKey ?? null;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + THIRTY_DAYS_MS);

  // No-op: already on this plan (and the subscription row exists).
  if (existing && fromKey === plan.key) {
    return { subscription: existing, invoice: null, changed: false };
  }

  const subscription = existing
    ? await updateSubscriptionForTenant(ctx.tenant.id, {
        planKey: plan.key,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      })
    : await insertSubscription({
        tenantId: ctx.tenant.id,
        planKey: plan.key,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

  if (!subscription) throw new AppError("INTERNAL_ERROR");

  // A priced plan bills; Enterprise (custom pricing) records no invoice here.
  let invoice: Invoice | null = null;
  if (plan.priceCents != null) {
    const seq = (await countInvoicesForTenant(ctx.tenant.id)) + 1;
    invoice = await insertInvoice({
      tenantId: ctx.tenant.id,
      subscriptionId: subscription.id,
      planKey: plan.key,
      number: makeInvoiceNumber(ctx.tenant.id, seq),
      amountCents: plan.priceCents,
      currency: plan.currency,
      status: "paid", // simulated payment succeeds immediately
      periodStart: now,
      periodEnd,
      paidAt: now,
      notes: `Switched to ${plan.name} (simulated).`,
    });
  }

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BILLING_PLAN_CHANGED,
    resourceType: "subscription",
    resourceId: subscription.id,
    before: { plan: fromKey },
    after: { plan: plan.key, invoice: invoice?.number ?? null },
  });

  ctx.log.info("billing.plan_changed", { from: fromKey, to: plan.key });
  return { subscription, invoice, changed: true };
}

export async function listInvoices(tenantId: string): Promise<Invoice[]> {
  return listInvoicesForTenant(tenantId);
}
