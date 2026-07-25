import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import {
  findActiveAssignmentForBooth,
  findActiveAssignmentForParticipation,
  insertAssignment,
} from "@/server/db/repositories/booth-assignments.repository";
import {
  findBoothById,
  insertBooth,
  listBoothsForEvent,
  listBoothsForEventPublic,
} from "@/server/db/repositories/booths.repository";
import { createEventWithDefaults } from "@/server/db/repositories/events.repository";
import { insertMerchant } from "@/server/db/repositories/merchants.repository";
import { insertParticipation } from "@/server/db/repositories/participations.repository";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import { insertZone, listZonesForEvent } from "@/server/db/repositories/zones.repository";

/**
 * Phase 4's slice of the isolation contract (spec §5, §34). Booths, zones, and
 * assignments are tenant-scoped like everything else; the public map read links a
 * booth to a merchant only when the participation is approved and the merchant is
 * active — the same "filter by public status" seam as Phase 2/3.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("booth isolation (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);

  let userA = "";
  let tenantA = "";
  let tenantB = "";
  let eventA = "";
  let zoneA = "";
  let approvedBooth = "";
  let draftBooth = "";
  let approvedParticipation = "";
  let approvedMerchantSlug = "";

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");
    userA = owner.id;

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "Booth Iso A", slug: `booth-a-${stamp}`, createdBy: userA }),
      insertTenant({ name: "Booth Iso B", slug: `booth-b-${stamp}`, createdBy: userA }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    const event = await createEventWithDefaults({
      tenantId: tenantA,
      name: "Booth Event",
      slug: `booth-event-${stamp}`,
      createdBy: userA,
    });
    eventA = event.id;

    approvedMerchantSlug = `booth-alpha-${stamp}`;
    const [alpha, beta] = await Promise.all([
      insertMerchant({ tenantId: tenantA, name: "Alpha", slug: approvedMerchantSlug }),
      insertMerchant({ tenantId: tenantA, name: "Beta", slug: `booth-beta-${stamp}` }),
    ]);

    const approved = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: alpha.id,
      approvalStatus: "approved",
    });
    approvedParticipation = approved.id;
    const draft = await insertParticipation({
      tenantId: tenantA,
      eventId: eventA,
      merchantId: beta.id,
      approvalStatus: "draft",
    });

    const zone = await insertZone({
      tenantId: tenantA,
      eventId: eventA,
      name: "Zone A",
      color: "#16a34a",
    });
    zoneA = zone.id;

    const b1 = await insertBooth({
      tenantId: tenantA,
      eventId: eventA,
      zoneId: zoneA,
      boothNumber: "A-1",
      status: "available",
    });
    approvedBooth = b1.id;
    const b2 = await insertBooth({
      tenantId: tenantA,
      eventId: eventA,
      boothNumber: "A-2",
      status: "available",
    });
    draftBooth = b2.id;

    // Approved merchant confirmed in A-1; draft merchant assigned to A-2.
    await insertAssignment({
      tenantId: tenantA,
      eventId: eventA,
      boothId: approvedBooth,
      participationId: approvedParticipation,
      merchantId: alpha.id,
      status: "confirmed",
    });
    await insertAssignment({
      tenantId: tenantA,
      eventId: eventA,
      boothId: draftBooth,
      participationId: draft.id,
      merchantId: beta.id,
      status: "assigned",
    });
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("finds a booth only within its own tenant", async () => {
    expect(await findBoothById(tenantA, approvedBooth)).not.toBeNull();
    expect(await findBoothById(tenantB, approvedBooth)).toBeNull();
  });

  it("lists booths and zones only for the owning tenant", async () => {
    expect(await listBoothsForEvent(tenantA, eventA)).toHaveLength(2);
    expect(await listBoothsForEvent(tenantB, eventA)).toHaveLength(0);
    expect(await listZonesForEvent(tenantA, eventA)).toHaveLength(1);
    expect(await listZonesForEvent(tenantB, eventA)).toHaveLength(0);
  });

  it("scopes active assignment lookups to the tenant", async () => {
    expect(await findActiveAssignmentForBooth(tenantA, approvedBooth)).not.toBeNull();
    expect(await findActiveAssignmentForBooth(tenantB, approvedBooth)).toBeNull();
    expect(
      await findActiveAssignmentForParticipation(tenantA, approvedParticipation),
    ).not.toBeNull();
    expect(await findActiveAssignmentForParticipation(tenantB, approvedParticipation)).toBeNull();
  });

  it("links a public booth to a merchant only when the listing is approved", async () => {
    const booths = await listBoothsForEventPublic(eventA);
    expect(booths).toHaveLength(2);

    const a1 = booths.find((b) => b.boothNumber === "A-1")!;
    const a2 = booths.find((b) => b.boothNumber === "A-2")!;

    // Approved merchant is exposed and clickable…
    expect(a1.merchantSlug).toBe(approvedMerchantSlug);
    // …the draft merchant's booth renders, but never leaks the merchant.
    expect(a2.merchantSlug).toBeNull();
    expect(a2.merchantName).toBeNull();
  });
});
