import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import {
  findItemInParticipation,
  insertItem,
  listItemsForParticipation,
} from "@/server/db/repositories/listing-items.repository";
import { createMerchantMember } from "@/server/db/repositories/merchant-members.repository";
import {
  findMerchantById,
  findMerchantForMember,
  insertMerchant,
  updateMerchant,
} from "@/server/db/repositories/merchants.repository";
import {
  findParticipationById,
  insertParticipation,
  listPublicParticipations,
} from "@/server/db/repositories/participations.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";

/**
 * Phase 3's slice of the isolation contract (spec §5, §34) across the *two*
 * scoping axes: a merchant is invisible/unwritable from another tenant, a
 * merchant member can only reach their own merchant, listing items are scoped to
 * their participation, and the public read exposes approved listings only.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("merchant isolation (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let userA = "";
  let userB = "";
  let tenantA = "";
  let tenantB = "";
  let merchantA1 = "";
  let merchantA2 = "";
  let merchantB = "";
  let approvedParticipation = "";
  let draftParticipation = "";
  let approvedItemId = "";

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      findProfileByEmail("organizer.owner@eventos.test"),
      findProfileByEmail("merchant.owner@eventos.test"),
    ]);
    if (!a || !b) throw new Error("Seed users missing — run `pnpm db:seed` first.");
    userA = a.id;
    userB = b.id;

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "Merch Iso A", slug: `merch-a-${stamp}`, createdBy: userA }),
      insertTenant({ name: "Merch Iso B", slug: `merch-b-${stamp}`, createdBy: userA }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    const [m1, m2, mb] = await Promise.all([
      insertMerchant({ tenantId: tenantA, name: "Alpha", slug: `alpha-${stamp}` }),
      insertMerchant({ tenantId: tenantA, name: "Beta", slug: `beta-${stamp}` }),
      insertMerchant({ tenantId: tenantB, name: "Gamma", slug: `gamma-${stamp}` }),
    ]);
    merchantA1 = m1.id;
    merchantA2 = m2.id;
    merchantB = mb.id;

    // userB manages merchantA1 only.
    await createMerchantMember({ merchantId: merchantA1, tenantId: tenantA, userId: userB });

    const event = await createEventWithDefaults({
      tenantId: tenantA,
      name: "Iso Event",
      slug: `iso-event-${stamp}`,
      createdBy: userA,
    });

    const approved = await insertParticipation({
      tenantId: tenantA,
      eventId: event.id,
      merchantId: merchantA1,
      listingTitle: "Alpha Listing",
      approvalStatus: "approved",
    });
    approvedParticipation = approved.id;

    const draft = await insertParticipation({
      tenantId: tenantA,
      eventId: event.id,
      merchantId: merchantA2,
      approvalStatus: "draft",
    });
    draftParticipation = draft.id;

    const item = await insertItem({
      tenantId: tenantA,
      participationId: approvedParticipation,
      merchantId: merchantA1,
      eventId: event.id,
      name: "Alpha Dish",
      price: "10.00",
    });
    approvedItemId = item.id;
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("finds a merchant only within its own tenant", async () => {
    expect(await findMerchantById(tenantA, merchantA1)).not.toBeNull();
    expect(await findMerchantById(tenantB, merchantA1)).toBeNull();
  });

  it("refuses a cross-tenant merchant update", async () => {
    expect(await updateMerchant(tenantB, merchantA1, { name: "Hijacked" })).toBeNull();
    expect((await findMerchantById(tenantA, merchantA1))?.name).toBe("Alpha");
  });

  it("resolves merchant membership only for actual members", async () => {
    // userB manages merchantA1…
    expect(await findMerchantForMember(userB, merchantA1)).not.toBeNull();
    // …but not merchantA2 (no membership) nor merchantB (other tenant).
    expect(await findMerchantForMember(userB, merchantA2)).toBeNull();
    expect(await findMerchantForMember(userB, merchantB)).toBeNull();
    // userA manages none of them.
    expect(await findMerchantForMember(userA, merchantA1)).toBeNull();
  });

  it("scopes participations to their tenant", async () => {
    expect(await findParticipationById(tenantA, approvedParticipation)).not.toBeNull();
    expect(await findParticipationById(tenantB, approvedParticipation)).toBeNull();
  });

  it("scopes listing items to their participation", async () => {
    expect(await listItemsForParticipation(approvedParticipation)).toHaveLength(1);
    // The approved listing's item is invisible under the draft participation.
    expect(await findItemInParticipation(draftParticipation, approvedItemId)).toBeNull();
    expect(await findItemInParticipation(approvedParticipation, approvedItemId)).not.toBeNull();
  });

  it("exposes only approved listings publicly", async () => {
    const event = (await findParticipationById(tenantA, approvedParticipation))!.eventId;
    const cards = await listPublicParticipations(event);
    const ids = cards.map((c) => c.merchantId);
    expect(ids).toContain(merchantA1); // approved
    expect(ids).not.toContain(merchantA2); // draft
  });
});
