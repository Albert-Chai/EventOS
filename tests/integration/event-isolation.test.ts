import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { createMemberWithRoles } from "@/server/db/repositories/members.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import {
  createEventWithDefaults,
  findEventById,
  findPublicEvent,
  listPublicEventsForTenant,
  slugExistsForTenant,
  updateEvent,
} from "@/server/db/repositories/events.repository";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";

/**
 * Phase 2's slice of the isolation contract (spec §5, §34): **an event created
 * in one tenant is invisible and unwritable from another**, and the *public*
 * reads expose published events only — never drafts. Runs against the real
 * database using the seeded users; skips when no database is configured.
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);

describe.skipIf(!hasDb)("event isolation (integration)", () => {
  const createdTenantIds: string[] = [];
  const stamp = String(Date.now()).slice(-9);
  const slugA = `iso-ev-a-${stamp}`;
  const slugB = `iso-ev-b-${stamp}`;
  const eventSlug = `pub-${stamp}`;
  const draftSlug = `draft-${stamp}`;

  let userA = "";
  let userB = "";
  let tenantA = "";
  let tenantB = "";
  let publishedId = "";

  beforeAll(async () => {
    const [a, b] = await Promise.all([
      findProfileByEmail("organizer.owner@eventos.test"),
      findProfileByEmail("organizer.staff@eventos.test"),
    ]);
    if (!a || !b) throw new Error("Seed users missing — run `pnpm db:seed` first.");
    userA = a.id;
    userB = b.id;

    const [ta, tb] = await Promise.all([
      insertTenant({ name: "Event Iso A", slug: slugA, createdBy: userA }),
      insertTenant({ name: "Event Iso B", slug: slugB, createdBy: userB }),
    ]);
    tenantA = ta.id;
    tenantB = tb.id;
    createdTenantIds.push(tenantA, tenantB);

    await Promise.all([
      createMemberWithRoles({ tenantId: tenantA, userId: userA, roleKeys: ["owner"] }),
      createMemberWithRoles({ tenantId: tenantB, userId: userB, roleKeys: ["event_manager"] }),
    ]);

    // A published, public event and a draft — both in tenant A.
    const published = await createEventWithDefaults({
      tenantId: tenantA,
      name: "Isolation Street Eats",
      slug: eventSlug,
      venueName: "Somewhere",
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 3 * 86_400_000),
      createdBy: userA,
    });
    publishedId = published.id;
    await updateEvent(tenantA, publishedId, { status: "published", publishedAt: new Date() });

    await createEventWithDefaults({
      tenantId: tenantA,
      name: "Isolation Draft",
      slug: draftSlug,
      createdBy: userA,
    });
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      // Cascade removes the events and their satellites with the tenant.
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it("finds an event only within its own tenant", async () => {
    expect(await findEventById(tenantA, publishedId)).not.toBeNull();
    // The boundary: tenant B asking for A's event id gets nothing.
    expect(await findEventById(tenantB, publishedId)).toBeNull();
  });

  it("refuses a cross-tenant update", async () => {
    const attempt = await updateEvent(tenantB, publishedId, { name: "Hijacked" });
    expect(attempt).toBeNull();

    const stillOurs = await findEventById(tenantA, publishedId);
    expect(stillOurs?.name).toBe("Isolation Street Eats");
  });

  it("does not leak event settings across tenants", async () => {
    expect(await getEventSettings(tenantA, publishedId)).not.toBeNull();
    expect(await getEventSettings(tenantB, publishedId)).toBeNull();
  });

  it("scopes slug uniqueness per tenant (two tenants may reuse a slug)", async () => {
    expect(await slugExistsForTenant(tenantA, eventSlug)).toBe(true);
    expect(await slugExistsForTenant(tenantB, eventSlug)).toBe(false);

    // Proof it is actually free in B: the same slug inserts without conflict.
    const twin = await createEventWithDefaults({
      tenantId: tenantB,
      name: "Twin",
      slug: eventSlug,
      createdBy: userB,
    });
    expect(twin.id).not.toBe(publishedId);
  });

  it("exposes published events publicly but never drafts", async () => {
    const publicEvent = await findPublicEvent(slugA, eventSlug);
    expect(publicEvent?.id).toBe(publishedId);
    expect(publicEvent?.phase).toBeDefined();

    // The draft is a 404 to the public — the Phase 2 exit criterion.
    expect(await findPublicEvent(slugA, draftSlug)).toBeNull();

    const listed = await listPublicEventsForTenant(slugA);
    expect(listed.map((e) => e.slug)).toContain(eventSlug);
    expect(listed.map((e) => e.slug)).not.toContain(draftSlug);
  });
});
