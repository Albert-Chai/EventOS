import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { db } from "@/server/db";
import { events, vouchers } from "@/server/db/schema";
import type { EventStatus } from "@/server/events/status";
import type { VoucherStatus } from "@/server/vouchers/status";

/**
 * The status scheduler's sweeps (see `docs/background-jobs.md`).
 *
 * These are the platform's only **system-wide, cross-tenant** writes: a cron with
 * no user advances date-driven statuses across every tenant at once. That is not a
 * §1 violation — there is no client and no membership involved, the clock is the
 * only input, and each affected row's own `tenant_id` is read from the row (never
 * supplied). The optional `scope.tenantId` narrows a run (used by tests so a sweep
 * can't touch seeded/other-suite rows, and available for a future per-tenant admin
 * re-run); production omits it for the global sweep.
 *
 * Each sweep selects the due rows `FOR UPDATE` — so two overlapping cron runs
 * serialize and never double-process a row — captures the prior status for the
 * audit `before`, and updates them in the same transaction. Idempotent: the
 * `WHERE` re-filters on the source status, so a second run finds nothing.
 *
 * The transition rules mirror the pure `dueEventStatus` / `dueVoucherStatus`
 * functions in the status modules, which are where the logic is unit-tested.
 */

export type Scope = { tenantId?: string } | undefined;

export type EventTransition = { id: string; tenantId: string; from: EventStatus; to: EventStatus };
export type VoucherTransition = {
  id: string;
  tenantId: string;
  from: VoucherStatus;
  to: VoucherStatus;
};

/** `published | live` whose end has passed ⇒ `ended`. */
export async function markEventsEnded(now: Date, scope?: Scope): Promise<EventTransition[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: events.id, tenantId: events.tenantId, status: events.status })
      .from(events)
      .where(
        and(
          inArray(events.status, ["published", "live"]),
          isNotNull(events.endAt),
          lte(events.endAt, now),
          isNull(events.deletedAt),
          scope?.tenantId ? eq(events.tenantId, scope.tenantId) : undefined,
        ),
      )
      .for("update");
    if (due.length === 0) return [];
    await tx
      .update(events)
      .set({ status: "ended" })
      .where(
        inArray(
          events.id,
          due.map((r) => r.id),
        ),
      );
    return due.map((r) => ({ id: r.id, tenantId: r.tenantId, from: r.status, to: "ended" }));
  });
}

/** `published` whose start has passed (and not past its end) ⇒ `live`. */
export async function markEventsLive(now: Date, scope?: Scope): Promise<EventTransition[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: events.id, tenantId: events.tenantId, status: events.status })
      .from(events)
      .where(
        and(
          eq(events.status, "published"),
          isNotNull(events.startAt),
          lte(events.startAt, now),
          or(isNull(events.endAt), gt(events.endAt, now)),
          isNull(events.deletedAt),
          scope?.tenantId ? eq(events.tenantId, scope.tenantId) : undefined,
        ),
      )
      .for("update");
    if (due.length === 0) return [];
    await tx
      .update(events)
      .set({ status: "live" })
      .where(
        inArray(
          events.id,
          due.map((r) => r.id),
        ),
      );
    return due.map((r) => ({ id: r.id, tenantId: r.tenantId, from: r.status, to: "live" }));
  });
}

/** `scheduled | active | paused` whose end has passed ⇒ `expired`. */
export async function markVouchersExpired(now: Date, scope?: Scope): Promise<VoucherTransition[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: vouchers.id, tenantId: vouchers.tenantId, status: vouchers.status })
      .from(vouchers)
      .where(
        and(
          inArray(vouchers.status, ["scheduled", "active", "paused"]),
          isNotNull(vouchers.endsAt),
          lte(vouchers.endsAt, now),
          isNull(vouchers.deletedAt),
          scope?.tenantId ? eq(vouchers.tenantId, scope.tenantId) : undefined,
        ),
      )
      .for("update");
    if (due.length === 0) return [];
    await tx
      .update(vouchers)
      .set({ status: "expired" })
      .where(
        inArray(
          vouchers.id,
          due.map((r) => r.id),
        ),
      );
    return due.map((r) => ({ id: r.id, tenantId: r.tenantId, from: r.status, to: "expired" }));
  });
}

/** `scheduled` whose start has passed (and not past its end) ⇒ `active`. */
export async function markVouchersActive(now: Date, scope?: Scope): Promise<VoucherTransition[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: vouchers.id, tenantId: vouchers.tenantId, status: vouchers.status })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.status, "scheduled"),
          isNotNull(vouchers.startsAt),
          lte(vouchers.startsAt, now),
          or(isNull(vouchers.endsAt), gt(vouchers.endsAt, now)),
          isNull(vouchers.deletedAt),
          scope?.tenantId ? eq(vouchers.tenantId, scope.tenantId) : undefined,
        ),
      )
      .for("update");
    if (due.length === 0) return [];
    await tx
      .update(vouchers)
      .set({ status: "active" })
      .where(
        inArray(
          vouchers.id,
          due.map((r) => r.id),
        ),
      );
    return due.map((r) => ({ id: r.id, tenantId: r.tenantId, from: r.status, to: "active" }));
  });
}
