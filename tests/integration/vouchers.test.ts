import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { tenants, vouchers as vouchersTable } from "@/server/db/schema";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import { insertVisitor } from "@/server/db/repositories/visitors.repository";
import {
  claimVoucherTx,
  findPublicVoucher,
  insertVoucher,
  listPublicVouchers,
  voucherPerformance,
} from "@/server/db/repositories/vouchers.repository";
import {
  findRedeemableCode,
  insertRedemption,
  listClaimedVoucherIds,
  listClaimsForVisitor,
} from "@/server/db/repositories/voucher-claims.repository";
import {
  countDeliveriesByStatus,
  insertCampaign,
  insertCampaignMessage,
  insertDeliveries,
  markDeliveriesSent,
  resolveAudience,
} from "@/server/db/repositories/campaigns.repository";
import { summariseDeliveries } from "@/server/campaigns/status";

/**
 * Phase 8's slice (spec §34): claiming under limits, the sold-out and
 * per-visitor guards, double-redeem prevention, tenant isolation, and campaign
 * audience resolution + reporting. Runs against the seeded live database; skips
 * otherwise.
 *
 * The service layer's `claimVoucher`/`redeemVoucher` read headers and cookies
 * (covered by e2e); here we drive the transactional repository directly, which
 * is where the concurrency guarantees actually live.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

const code = (n: number) => `T${String(Date.now()).slice(-8)}${n}`;

describe.skipIf(!hasDb)("vouchers, redemption & campaigns (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let tenantA = "";
  let tenantB = "";
  let eventA = "";
  let eventB = "";
  let merchantA = "";
  let visitor1 = "";
  let visitor2 = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "Vo A", slug: `vo-a-${stamp}`, createdBy: owner.id }),
      insertTenant({ name: "Vo B", slug: `vo-b-${stamp}`, createdBy: owner.id }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    const [ea, eb] = await Promise.all([
      createEventWithDefaults({ tenantId: tenantA, name: "Vo Ev A", slug: `vo-ev-a-${stamp}`, createdBy: owner.id }),
      createEventWithDefaults({ tenantId: tenantB, name: "Vo Ev B", slug: `vo-ev-b-${stamp}`, createdBy: owner.id }),
    ]);
    eventA = ea.id;
    eventB = eb.id;

    const merchant = await insertMerchant({ tenantId: tenantA, name: "Vo M", slug: `vo-m-${stamp}` });
    merchantA = merchant.id;

    const [v1, v2] = await Promise.all([
      insertVisitor({ anonymousId: `vo-visitor-1-${stamp}` }),
      insertVisitor({ anonymousId: `vo-visitor-2-${stamp}` }),
    ]);
    visitor1 = v1.id;
    visitor2 = v2.id;
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  async function makeVoucher(overrides: Partial<Parameters<typeof insertVoucher>[0]> = {}) {
    return insertVoucher({
      tenantId: tenantA,
      eventId: eventA,
      title: "Test voucher",
      voucherType: "discount_percent",
      discountPercent: 10,
      status: "active",
      perVisitorLimit: 1,
      ...overrides,
    });
  }

  it("claims a voucher and issues a unique code", async () => {
    const voucher = await makeVoucher();
    const result = await claimVoucherTx({
      voucherId: voucher.id,
      visitorId: visitor1,
      eventId: eventA,
      now: new Date(),
      generateCode: () => code(1),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toHaveLength(10);

    const claimed = await listClaimedVoucherIds(visitor1, eventA);
    expect(claimed).toContain(voucher.id);

    // The denormalized counter moved in the same transaction.
    const [row] = await db.select().from(vouchersTable).where(eq(vouchersTable.id, voucher.id));
    expect(row?.claimedCount).toBe(1);
  });

  it("enforces the per-visitor limit", async () => {
    const voucher = await makeVoucher({ perVisitorLimit: 1 });
    const first = await claimVoucherTx({
      voucherId: voucher.id,
      visitorId: visitor1,
      eventId: eventA,
      now: new Date(),
      generateCode: () => code(2),
    });
    expect(first.ok).toBe(true);

    const second = await claimVoucherTx({
      voucherId: voucher.id,
      visitorId: visitor1,
      eventId: eventA,
      now: new Date(),
      generateCode: () => code(3),
    });
    expect(second).toEqual({ ok: false, reason: "limit_reached" });

    // A different visitor is unaffected by the first visitor's limit.
    const other = await claimVoucherTx({
      voucherId: voucher.id,
      visitorId: visitor2,
      eventId: eventA,
      now: new Date(),
      generateCode: () => code(4),
    });
    expect(other.ok).toBe(true);
  });

  it("never over-issues a limited voucher, even under concurrent claims", async () => {
    // One left; fire several claims at once. The row lock must serialise them.
    const voucher = await makeVoucher({ totalQuantity: 1, perVisitorLimit: 5 });
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        claimVoucherTx({
          voucherId: voucher.id,
          visitorId: n % 2 === 0 ? visitor1 : visitor2,
          eventId: eventA,
          now: new Date(),
          generateCode: () => code(10 + n),
        }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "sold_out")).toHaveLength(3);

    const [row] = await db.select().from(vouchersTable).where(eq(vouchersTable.id, voucher.id));
    expect(row?.claimedCount).toBe(1);
  });

  it("refuses to claim a voucher that is not active or outside its window", async () => {
    const draft = await makeVoucher({ status: "draft" });
    await expect(
      claimVoucherTx({
        voucherId: draft.id,
        visitorId: visitor1,
        eventId: eventA,
        now: new Date(),
        generateCode: () => code(20),
      }),
    ).resolves.toEqual({ ok: false, reason: "not_claimable" });

    const ended = await makeVoucher({ endsAt: new Date(Date.now() - 60_000) });
    await expect(
      claimVoucherTx({
        voucherId: ended.id,
        visitorId: visitor1,
        eventId: eventA,
        now: new Date(),
        generateCode: () => code(21),
      }),
    ).resolves.toEqual({ ok: false, reason: "not_claimable" });
  });

  it("hides non-active vouchers from the public list", async () => {
    await makeVoucher({ status: "draft", title: "Hidden draft" });
    const active = await makeVoucher({ title: "Visible" });

    const list = await listPublicVouchers(eventA);
    expect(list.some((v) => v.id === active.id)).toBe(true);
    expect(list.some((v) => v.title === "Hidden draft")).toBe(false);

    // And a draft can't be resolved directly by id either.
    const drafts = await db
      .select()
      .from(vouchersTable)
      .where(eq(vouchersTable.title, "Hidden draft"))
      .limit(1);
    expect(await findPublicVoucher(eventA, drafts[0]!.id)).toBeNull();
  });

  it("redeems a code exactly once", async () => {
    const voucher = await makeVoucher({ merchantId: merchantA });
    const claim = await claimVoucherTx({
      voucherId: voucher.id,
      visitorId: visitor2,
      eventId: eventA,
      now: new Date(),
      generateCode: () => code(30),
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const found = await findRedeemableCode(claim.code);
    expect(found?.tenantId).toBe(tenantA);
    expect(found?.alreadyRedeemedAt).toBeNull();

    await insertRedemption({
      tenantId: tenantA,
      voucherId: voucher.id,
      voucherCodeId: claim.codeId,
      claimId: claim.claimId,
      eventId: eventA,
      merchantId: merchantA,
      visitorId: visitor2,
    });

    // The code is now marked redeemed…
    const after = await findRedeemableCode(claim.code);
    expect(after?.codeStatus).toBe("redeemed");
    expect(after?.alreadyRedeemedAt).not.toBeNull();

    // …and a second redemption is rejected by the unique constraint, which is
    // what actually prevents a double spend under concurrency.
    await expect(
      insertRedemption({
        tenantId: tenantA,
        voucherId: voucher.id,
        voucherCodeId: claim.codeId,
        claimId: claim.claimId,
        eventId: eventA,
        merchantId: merchantA,
        visitorId: visitor2,
      }),
    ).rejects.toThrow();
  });

  it("shows a visitor their own claimed codes only", async () => {
    const mine = await listClaimsForVisitor(visitor2, eventA);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((c) => typeof c.code === "string")).toBe(true);

    // A visitor with no claims in another tenant's event sees nothing.
    expect(await listClaimsForVisitor(visitor2, eventB)).toHaveLength(0);
  });

  it("isolates vouchers and their performance by tenant", async () => {
    // Tenant B's event has no vouchers at all.
    expect(await listPublicVouchers(eventB)).toHaveLength(0);
    expect(await voucherPerformance(tenantB, eventA)).toHaveLength(0);

    const perf = await voucherPerformance(tenantA, eventA);
    expect(perf.length).toBeGreaterThan(0);
  });

  it("resolves an audience and reports campaign deliveries", async () => {
    const campaign = await insertCampaign({
      tenantId: tenantA,
      eventId: eventA,
      name: "Test campaign",
      channel: "email",
    });
    const message = await insertCampaignMessage({
      tenantId: tenantA,
      campaignId: campaign.id,
      channel: "email",
      subject: "Hello",
      body: "Body",
    });

    // Visitors who claimed a voucher in this event — both test visitors did.
    const recipients = await resolveAudience(tenantA, eventA, "claimed_voucher");
    expect(recipients).toContain(visitor1);
    expect(recipients).toContain(visitor2);

    // The same audience under the other tenant is empty (isolation).
    expect(await resolveAudience(tenantB, eventA, "claimed_voucher")).toHaveLength(0);

    await insertDeliveries(
      recipients.map((visitorId) => ({
        tenantId: tenantA,
        campaignId: campaign.id,
        messageId: message.id,
        eventId: eventA,
        visitorId,
        channel: "email" as const,
        status: "queued" as const,
      })),
    );

    const sent = await markDeliveriesSent(campaign.id, "simulated", new Date());
    expect(sent).toBe(recipients.length);

    const report = summariseDeliveries(await countDeliveriesByStatus(tenantA, campaign.id));
    expect(report.recipients).toBe(recipients.length);
    expect(report.reached).toBe(recipients.length);
    expect(report.deliveryRate).toBe(100);

    // Another tenant cannot read this campaign's deliveries.
    expect(await countDeliveriesByStatus(tenantB, campaign.id)).toEqual({});
  });
});
