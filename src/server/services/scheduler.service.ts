import {
  markEventsEnded,
  markEventsLive,
  markVouchersActive,
  markVouchersExpired,
  type EventTransition,
  type VoucherTransition,
} from "@/server/db/repositories/scheduler.repository";
import { logger } from "@/server/telemetry/logger";
import { AUDIT_ACTIONS, recordSystemAudits, type SystemAuditEntry } from "./audit.service";

/**
 * The status scheduler (spec §34 job runner; see `docs/background-jobs.md`).
 *
 * Advances date-driven statuses that nothing else moves: events
 * `published → live → ended` and vouchers `scheduled → active → expired`. Each
 * transition is a real state change, so it is system-audited with a null actor
 * and the affected row's own tenant. Idempotent — a re-run finds nothing due —
 * so the cron can safely retry.
 *
 * `now` is injected (defaults to the wall clock) so tests are deterministic;
 * `tenantId` narrows a run to one tenant (tests use it for hermeticity), and is
 * omitted by the production cron for a global sweep.
 */

export type SchedulerResult = {
  eventsLive: number;
  eventsEnded: number;
  vouchersActivated: number;
  vouchersExpired: number;
};

function eventAudits(rows: EventTransition[]): SystemAuditEntry[] {
  return rows.map((r) => ({
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGED,
    tenantId: r.tenantId,
    resourceType: "event",
    resourceId: r.id,
    before: { status: r.from },
    after: { status: r.to, by: "scheduler" },
  }));
}

function voucherAudits(rows: VoucherTransition[]): SystemAuditEntry[] {
  return rows.map((r) => ({
    action: AUDIT_ACTIONS.VOUCHER_STATUS_CHANGED,
    tenantId: r.tenantId,
    resourceType: "voucher",
    resourceId: r.id,
    before: { status: r.from },
    after: { status: r.to, by: "scheduler" },
  }));
}

export async function runStatusScheduler(opts?: {
  now?: Date;
  tenantId?: string;
}): Promise<SchedulerResult> {
  const now = opts?.now ?? new Date();
  const scope = opts?.tenantId ? { tenantId: opts.tenantId } : undefined;

  // End before going live, and expire before activating, so a row already past
  // its end settles into the terminal status rather than briefly advancing.
  const ended = await markEventsEnded(now, scope);
  const live = await markEventsLive(now, scope);
  const expired = await markVouchersExpired(now, scope);
  const activated = await markVouchersActive(now, scope);

  await recordSystemAudits([
    ...eventAudits(ended),
    ...eventAudits(live),
    ...voucherAudits(expired),
    ...voucherAudits(activated),
  ]);

  const result: SchedulerResult = {
    eventsLive: live.length,
    eventsEnded: ended.length,
    vouchersActivated: activated.length,
    vouchersExpired: expired.length,
  };

  const moved =
    result.eventsLive + result.eventsEnded + result.vouchersActivated + result.vouchersExpired;
  if (moved > 0) logger.info("scheduler.run", result);

  return result;
}
