import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { tenants, visitors } from "@/server/db/schema";
import {
  listCategoriesInUse,
  searchPublicDirectory,
} from "@/server/db/repositories/directory.repository";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import { insertItem } from "@/server/db/repositories/listing-items.repository";
import { insertCategory } from "@/server/db/repositories/merchant-categories.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { insertParticipation } from "@/server/db/repositories/participations.repository";
import { insertBooth } from "@/server/db/repositories/booths.repository";
import { insertAssignment } from "@/server/db/repositories/booth-assignments.repository";
import { insertZone } from "@/server/db/repositories/zones.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import {
  addFavourite,
  listFavouriteCards,
  listFavouriteParticipationIds,
  removeFavourite,
} from "@/server/db/repositories/visitor-favourites.repository";
import {
  listRecentViewCards,
  upsertRecentView,
} from "@/server/db/repositories/visitor-recent-views.repository";
import { insertVisitor } from "@/server/db/repositories/visitors.repository";

/**
 * Phase 5's slice of the isolation contract (spec §5, §8.8, §8.9, §34). Two
 * things are under test:
 *
 *  1. The public directory search only ever surfaces *publicly-visible* listings
 *     (approved participation + active merchant), and the MVP filters — full-text,
 *     category, zone, halal, promo, price — narrow that set correctly.
 *  2. A visitor's favourites and recent views are keyed by the (cookie-derived)
 *     visitor and the event: one visitor never sees another's, one event never
 *     leaks into another, and an unapproved listing silently drops from the lists.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

const names = (rows: { merchantName: string }[]) => rows.map((r) => r.merchantName).sort();

describe.skipIf(!hasDb)("visitor directory & favourites (integration)", () => {
  const createdTenantIds: string[] = [];
  const createdVisitorIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let tenantA = "";
  let eventA = "";
  let otherEvent = "";
  let foodCat = "";
  let zoneA = "";

  let alphaPart = "";
  let betaPart = "";
  let alphaMerchant = "";
  let betaMerchant = "";
  let visitorA = "";
  let visitorB = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const ta = await insertTenant({ name: "Dir A", slug: `dir-a-${stamp}`, createdBy: owner.id });
    tenantA = ta.id;
    createdTenantIds.push(tenantA);

    const [ev, ev2] = await Promise.all([
      createEventWithDefaults({
        tenantId: tenantA,
        name: "Dir Event",
        slug: `dir-event-${stamp}`,
        createdBy: owner.id,
      }),
      createEventWithDefaults({
        tenantId: tenantA,
        name: "Other Event",
        slug: `other-event-${stamp}`,
        createdBy: owner.id,
      }),
    ]);
    eventA = ev.id;
    otherEvent = ev2.id;

    const [food, drinks] = await Promise.all([
      insertCategory({ tenantId: tenantA, name: "Food", slug: `food-${stamp}` }),
      insertCategory({ tenantId: tenantA, name: "Drinks", slug: `drinks-${stamp}` }),
    ]);
    foodCat = food.id;

    const zone = await insertZone({
      tenantId: tenantA,
      eventId: eventA,
      name: "Zone A",
      color: "#16a34a",
    });
    zoneA = zone.id;

    // Alpha: approved + active, Food, halal + promo items, booth in Zone A.
    const alpha = await insertMerchant({
      tenantId: tenantA,
      name: "Alpha",
      slug: `alpha-${stamp}`,
      categoryId: foodCat,
      status: "active",
    });
    const alphaP = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: alpha.id,
      approvalStatus: "approved",
      listingTitle: "Alpha Kitchen",
    });
    alphaPart = alphaP.id;
    alphaMerchant = alpha.id;
    await insertItem({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: alpha.id,
      participationId: alphaPart,
      name: "Beef Rendang",
      description: "Slow-cooked and spicy",
      price: "12.00",
      promoPrice: "9.00",
      isHalal: true,
      dietaryTags: ["spicy"],
    });
    await insertItem({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: alpha.id,
      participationId: alphaPart,
      name: "Teh Tarik",
      price: "5.00",
    });
    const alphaBooth = await insertBooth({
      tenantId: tenantA,
      eventId: eventA,
      zoneId: zoneA,
      boothNumber: "A-1",
      status: "confirmed",
    });
    await insertAssignment({
      tenantId: tenantA,
      eventId: eventA,
      boothId: alphaBooth.id,
      participationId: alphaPart,
      merchantId: alpha.id,
      status: "confirmed",
    });

    // Delta: approved + active, Drinks, cheap non-halal item, no booth.
    const delta = await insertMerchant({
      tenantId: tenantA,
      name: "Delta",
      slug: `delta-${stamp}`,
      categoryId: drinks.id,
      status: "active",
    });
    const deltaP = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: delta.id,
      approvalStatus: "approved",
    });
    await insertItem({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: delta.id,
      participationId: deltaP.id,
      name: "Kopi",
      price: "3.00",
    });

    // Beta: DRAFT participation (must never appear publicly).
    const beta = await insertMerchant({
      tenantId: tenantA,
      name: "Beta",
      slug: `beta-${stamp}`,
      categoryId: foodCat,
      status: "active",
    });
    const betaP = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: beta.id,
      approvalStatus: "draft",
    });
    betaPart = betaP.id;
    betaMerchant = beta.id;

    // Gamma: approved participation but SUSPENDED merchant (must never appear).
    const gamma = await insertMerchant({
      tenantId: tenantA,
      name: "Gamma",
      slug: `gamma-${stamp}`,
      categoryId: foodCat,
      status: "suspended",
    });
    await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: gamma.id,
      approvalStatus: "approved",
    });

    const [va, vb] = await Promise.all([
      insertVisitor({ anonymousId: `vis-a-${stamp}` }),
      insertVisitor({ anonymousId: `vis-b-${stamp}` }),
    ]);
    visitorA = va.id;
    visitorB = vb.id;
    createdVisitorIds.push(visitorA, visitorB);
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (createdVisitorIds.length > 0) {
      await db.delete(visitors).where(inArray(visitors.id, createdVisitorIds));
    }
  });

  // --- Directory search ------------------------------------------------------

  it("returns only approved + active listings", async () => {
    // Alpha + Delta are public; Beta (draft) and Gamma (suspended) are not.
    expect(names(await searchPublicDirectory(eventA, {}))).toEqual(["Alpha", "Delta"]);
  });

  it("full-text matches merchant name and item text", async () => {
    expect(names(await searchPublicDirectory(eventA, { query: "alpha" }))).toEqual(["Alpha"]);
    expect(names(await searchPublicDirectory(eventA, { query: "rendang" }))).toEqual(["Alpha"]);
    expect(names(await searchPublicDirectory(eventA, { query: "kopi" }))).toEqual(["Delta"]);
    expect(await searchPublicDirectory(eventA, { query: "zzznotathing" })).toHaveLength(0);
  });

  it("applies the category, zone, halal, promo, and price filters", async () => {
    expect(names(await searchPublicDirectory(eventA, { categoryId: foodCat }))).toEqual(["Alpha"]);
    expect(names(await searchPublicDirectory(eventA, { zoneId: zoneA }))).toEqual(["Alpha"]);
    expect(names(await searchPublicDirectory(eventA, { halal: true }))).toEqual(["Alpha"]);
    expect(names(await searchPublicDirectory(eventA, { promoOnly: true }))).toEqual(["Alpha"]);
    // Alpha's cheapest item is 5.00, Delta's is 3.00.
    expect(names(await searchPublicDirectory(eventA, { priceMax: 4 }))).toEqual(["Delta"]);
    expect(names(await searchPublicDirectory(eventA, { priceMin: 6 }))).toEqual(["Alpha"]);
  });

  it("exposes the booth number and halal/promo flags on the card", async () => {
    const [alpha] = await searchPublicDirectory(eventA, { query: "alpha" });
    expect(alpha.boothNumber).toBe("A-1");
    expect(alpha.zoneName).toBe("Zone A");
    expect(alpha.hasHalal).toBe(true);
    expect(alpha.hasPromo).toBe(true);
    expect(alpha.minPrice).toBe("5.00");
    expect(alpha.listingTitle).toBe("Alpha Kitchen");
  });

  it("lists only categories used by public listings", async () => {
    // Food (Alpha) + Drinks (Delta). Gamma's Food is inactive; Beta's is a draft.
    expect((await listCategoriesInUse(eventA)).map((c) => c.name)).toEqual(["Drinks", "Food"]);
  });

  // --- Favourites ------------------------------------------------------------

  it("keeps favourites private to the visitor and the event", async () => {
    expect(await addFavourite(favInput(visitorA, alphaPart, alphaMerchant))).toBe(true);
    // Idempotent: a second save is a no-op.
    expect(await addFavourite(favInput(visitorA, alphaPart, alphaMerchant))).toBe(false);
    // Favouriting a draft listing is allowed, but it will never show as a card.
    await addFavourite(favInput(visitorA, betaPart, betaMerchant));

    expect(await listFavouriteParticipationIds(visitorA, eventA)).toEqual(
      expect.arrayContaining([alphaPart, betaPart]),
    );
    // Visitor B sees nothing of A's; event isolation holds too.
    expect(await listFavouriteParticipationIds(visitorB, eventA)).toEqual([]);
    expect(await listFavouriteParticipationIds(visitorA, otherEvent)).toEqual([]);
  });

  it("returns favourite cards only for still-public listings", async () => {
    const cards = await listFavouriteCards(visitorA, eventA);
    // Beta was favourited but is a draft — dropped silently.
    expect(names(cards)).toEqual(["Alpha"]);

    expect(await removeFavourite(visitorA, alphaPart)).toBe(true);
    expect(names(await listFavouriteCards(visitorA, eventA))).toEqual([]);
  });

  // --- Recent views ----------------------------------------------------------

  it("records recent views idempotently and filters to public listings", async () => {
    await upsertRecentView(favInput(visitorA, alphaPart, alphaMerchant));
    await upsertRecentView(favInput(visitorA, betaPart, betaMerchant));
    // Re-viewing Alpha bumps its timestamp rather than duplicating the row.
    await upsertRecentView(favInput(visitorA, alphaPart, alphaMerchant));

    const cards = await listRecentViewCards(visitorA, eventA, 8);
    expect(names(cards)).toEqual(["Alpha"]); // Beta (draft) excluded; Alpha once.
    expect(await listRecentViewCards(visitorB, eventA, 8)).toHaveLength(0);
  });

  function favInput(visitorId: string, participationId: string, merchantId: string) {
    return { visitorId, tenantId: tenantA, eventId: eventA, participationId, merchantId };
  }
});
