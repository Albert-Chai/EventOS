import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { PLAN_TIERS, PLANS } from "@/server/billing/plans";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import {
  closeOpenPlacements,
  insertPlacement,
  listOpenParticipationIdsForEvent,
} from "@/server/db/repositories/featured-placements.repository";
import {
  countInvoicesForTenant,
  insertInvoice,
  listInvoicesForTenant,
} from "@/server/db/repositories/invoices.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { insertParticipation } from "@/server/db/repositories/participations.repository";
import { upsertPlan } from "@/server/db/repositories/plans.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertSubscription } from "@/server/db/repositories/subscriptions.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import { getTenantPlan } from "@/server/services/plan.service";
import {
  assertWithinLimit,
  computeUsage,
  requirePlanFeature,
} from "@/server/services/usage.service";

/**
 * Phase 6's slice (spec §22, §34): plan resolution, hard-limit enforcement,
 * feature gating, usage computation, and featured-placement behaviour — all
 * tenant-isolated. Runs against the seeded live database; skips otherwise.
 *
 * The audit-writing services (`changePlan`, `featureMerchant`) call `headers()`
 * and are covered by the e2e flow instead; here we exercise the header-free
 * enforcement + repository layer directly.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("billing, limits & featured (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let tenantA = "";
  let tenantB = "";
  let eventA = "";
  let participationA = "";
  let merchantA = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    // Make the plan catalog present regardless of seed state (idempotent).
    for (const key of PLAN_TIERS) {
      const p = PLANS[key];
      await upsertPlan({
        key: p.key,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        billingInterval: p.billingInterval,
        limits: p.limits,
        features: [...p.features],
        analyticsRetentionDays: p.analyticsRetentionDays,
        sortOrder: p.sortOrder,
      });
    }

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "Bill A", slug: `bill-a-${stamp}`, createdBy: owner.id }),
      insertTenant({ name: "Bill B", slug: `bill-b-${stamp}`, createdBy: owner.id }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    // Tenant A already uses its one Starter event.
    const event = await createEventWithDefaults({
      tenantId: tenantA,
      name: "Bill Event",
      slug: `bill-event-${stamp}`,
      createdBy: owner.id,
    });
    eventA = event.id;

    const merchant = await insertMerchant({
      tenantId: tenantA,
      name: "Bill Merchant",
      slug: `bill-merchant-${stamp}`,
    });
    merchantA = merchant.id;
    const participation = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: merchantA,
      approvalStatus: "approved",
    });
    participationA = participation.id;
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("defaults a tenant with no subscription to Starter", async () => {
    const { plan, subscription } = await getTenantPlan(tenantA);
    expect(plan.key).toBe("starter");
    expect(subscription).toBeNull();
  });

  it("enforces the Starter events hard limit", async () => {
    // Tenant A has 1 event; Starter allows 1, so a second would exceed.
    await expect(assertWithinLimit(tenantA, "events")).rejects.toHaveProperty(
      "code",
      "PLAN_LIMIT_REACHED",
    );
    // Tenant B has 0 events — its first fits.
    await expect(assertWithinLimit(tenantB, "events")).resolves.toBeUndefined();
  });

  it("gates featured listings by plan", async () => {
    await expect(requirePlanFeature(tenantA, "featured_listings")).rejects.toHaveProperty(
      "code",
      "PLAN_FEATURE_REQUIRED",
    );
  });

  it("lifts limits and unlocks features after an upgrade, per tenant", async () => {
    await insertSubscription({ tenantId: tenantA, planKey: "growth", status: "active" });

    const { plan } = await getTenantPlan(tenantA);
    expect(plan.key).toBe("growth");

    // Growth allows 3 events, so a 2nd is fine now; the feature is unlocked.
    await expect(assertWithinLimit(tenantA, "events")).resolves.toBeUndefined();
    await expect(requirePlanFeature(tenantA, "featured_listings")).resolves.toBeUndefined();

    // Isolation: tenant B is untouched — still Starter.
    expect((await getTenantPlan(tenantB)).plan.key).toBe("starter");
  });

  it("computes usage against the plan limits", async () => {
    const { plan } = await getTenantPlan(tenantA);
    const usage = await computeUsage(tenantA, plan, { eventId: eventA });

    const events = usage.find((u) => u.metric === "events")!;
    expect(events.current).toBe(1);
    expect(events.limit).toBe(3); // growth

    const merchants = usage.find((u) => u.metric === "merchants_per_event")!;
    expect(merchants.current).toBe(1);

    const emails = usage.find((u) => u.metric === "email_sends")!;
    expect(emails.current).toBe(0); // ledger empty
  });

  it("scopes invoices to their tenant", async () => {
    await insertInvoice({
      tenantId: tenantA,
      planKey: "growth",
      number: `INV-TEST-${stamp}`,
      amountCents: 299_900,
      currency: "MYR",
      status: "paid",
    });
    expect(await listInvoicesForTenant(tenantA)).toHaveLength(1);
    expect(await listInvoicesForTenant(tenantB)).toHaveLength(0);
    expect(await countInvoicesForTenant(tenantA)).toBe(1);
  });

  it("keeps one open featured placement per participation", async () => {
    await insertPlacement({
      tenantId: tenantA,
      eventId: eventA,
      participationId: participationA,
      merchantId: merchantA,
      placementType: "homepage_featured",
      rankPriority: 100,
    });
    expect(await listOpenParticipationIdsForEvent(eventA)).toContain(participationA);

    // A second *open* placement for the same participation violates the partial
    // unique index.
    await expect(
      insertPlacement({
        tenantId: tenantA,
        eventId: eventA,
        participationId: participationA,
        merchantId: merchantA,
        placementType: "search_boost",
      }),
    ).rejects.toThrow();

    // Closing frees it; it drops from the open list and can be re-featured.
    await closeOpenPlacements(tenantA, participationA, new Date());
    expect(await listOpenParticipationIdsForEvent(eventA)).not.toContain(participationA);

    await insertPlacement({
      tenantId: tenantA,
      eventId: eventA,
      participationId: participationA,
      merchantId: merchantA,
      placementType: "homepage_featured",
    });
    expect(await listOpenParticipationIdsForEvent(eventA)).toContain(participationA);
  });
});
