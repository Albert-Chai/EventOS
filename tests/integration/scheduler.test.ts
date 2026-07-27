import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { auditLogs, events, tenants, vouchers } from "@/server/db/schema";
import { findProfileByEmail } from "@/server/db/repositories/profiles.repository";
import { insertTenant } from "@/server/db/repositories/tenants.repository";
import { insertVoucher } from "@/server/db/repositories/vouchers.repository";
import type { EventStatus } from "@/server/events/status";
import type { VoucherStatus } from "@/server/vouchers/status";
import { runStatusScheduler } from "@/server/services/scheduler.service";

/**
 * The status scheduler against the live database (see `docs/background-jobs.md`).
 * Skips without `DIRECT_DATABASE_URL`. Everything runs inside one throwaway
 * tenant and the scheduler is scoped to it, so a global sweep can never touch
 * seeded or other-suite rows. Proves: the right rows move, a not-yet-due control
 * row does not, transitions are system-audited with a null actor, and a second
 * run is a no-op (idempotent).
 */
const hasDb = Boolean(process.env.DIRECT_DATABASE_URL);
const stamp = String(Date.now()).slice(-9);

describe.skipIf(!hasDb)("status scheduler (integration)", () => {
  const createdTenantIds: string[] = [];
  let tenantId = "";
  let eventId = "";

  const now = new Date();
  const past = new Date(now.getTime() - 60_000);
  const future = new Date(now.getTime() + 60 * 60_000);

  // Event ids by intent.
  let eLive = "";
  let eEnded = "";
  let eLiveEnded = "";
  let eControl = "";
  let eDraft = "";
  // Voucher ids by intent.
  let vActivate = "";
  let vExpire = "";
  let vSchedExpire = "";
  let vControl = "";

  async function makeEvent(slug: string, status: EventStatus, startAt: Date, endAt: Date | null) {
    const [row] = await db
      .insert(events)
      .values({ tenantId, name: slug, slug: `${slug}-${stamp}`, status, startAt, endAt })
      .returning();
    return row!.id;
  }

  async function eventStatus(id: string): Promise<EventStatus> {
    const [row] = await db.select({ s: events.status }).from(events).where(eq(events.id, id));
    return row!.s;
  }

  async function voucherStatus(id: string): Promise<VoucherStatus> {
    const [row] = await db.select({ s: vouchers.status }).from(vouchers).where(eq(vouchers.id, id));
    return row!.s;
  }

  beforeAll(async () => {
    const owner = await findProfileByEmail("organizer.owner@eventos.test");
    if (!owner) throw new Error("Seed users missing — run `pnpm db:seed` first.");

    const t = await insertTenant({ name: "Sched", slug: `sched-${stamp}`, createdBy: owner.id });
    tenantId = t.id;
    createdTenantIds.push(tenantId);

    eLive = await makeEvent("s-live", "published", past, future);
    eEnded = await makeEvent("s-ended", "published", past, past);
    eLiveEnded = await makeEvent("s-live-ended", "live", past, past);
    eControl = await makeEvent("s-ctl", "published", future, future);
    eDraft = await makeEvent("s-draft", "draft", past, future);
    eventId = eLive;

    const mkVoucher = (title: string, status: VoucherStatus, startsAt: Date, endsAt: Date | null) =>
      insertVoucher({ tenantId, eventId, title, status, startsAt, endsAt });

    vActivate = (await mkVoucher("v-activate", "scheduled", past, future)).id;
    vExpire = (await mkVoucher("v-expire", "active", past, past)).id;
    vSchedExpire = (await mkVoucher("v-sched-expire", "scheduled", past, past)).id;
    vControl = (await mkVoucher("v-ctl", "scheduled", future, future)).id;
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  it(
    "advances every due row, leaves controls, audits as system, and is idempotent",
    { timeout: 30_000 },
    async () => {
      const result = await runStatusScheduler({ now, tenantId });

      expect(result).toEqual({
        eventsLive: 1,
        eventsEnded: 2,
        vouchersActivated: 1,
        vouchersExpired: 2,
      });

      // Events moved as expected.
      expect(await eventStatus(eLive)).toBe("live");
      expect(await eventStatus(eEnded)).toBe("ended");
      expect(await eventStatus(eLiveEnded)).toBe("ended");
      // Controls untouched.
      expect(await eventStatus(eControl)).toBe("published");
      expect(await eventStatus(eDraft)).toBe("draft");

      // Vouchers moved as expected.
      expect(await voucherStatus(vActivate)).toBe("active");
      expect(await voucherStatus(vExpire)).toBe("expired");
      expect(await voucherStatus(vSchedExpire)).toBe("expired");
      expect(await voucherStatus(vControl)).toBe("scheduled");

      // Six system audit lines (3 events + 3 vouchers), all with a null actor
      // and marked as done by the scheduler.
      const audits = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, tenantId), isNull(auditLogs.actorUserId)));
      expect(audits).toHaveLength(6);
      for (const a of audits) {
        expect(a.actorUserId).toBeNull();
        expect(["event.status_changed", "voucher.status_changed"]).toContain(a.action);
        expect((a.afterJson as { by?: string }).by).toBe("scheduler");
      }

      // Idempotent: a second run finds nothing and writes no further audits.
      const again = await runStatusScheduler({ now, tenantId });
      expect(again).toEqual({
        eventsLive: 0,
        eventsEnded: 0,
        vouchersActivated: 0,
        vouchersExpired: 0,
      });
      const auditsAfter = await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, tenantId), isNull(auditLogs.actorUserId)));
      expect(auditsAfter).toHaveLength(6);
    },
  );
});
