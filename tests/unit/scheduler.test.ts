import { describe, expect, it } from "vitest";

import { dueEventStatus } from "@/server/events/status";
import { dueVoucherStatus } from "@/server/vouchers/status";

/**
 * The scheduler's transition rules (see `docs/background-jobs.md`). These pure
 * functions are the source of truth the SQL sweeps in `scheduler.repository.ts`
 * mirror, so every source status and both sides of the start/end boundary are
 * pinned here — including the "already past end" precedence and open-ended
 * (null date) cases.
 */

const PAST = new Date("2026-01-01T00:00:00Z");
const AT = new Date("2026-06-01T12:00:00Z");
const FUTURE = new Date("2026-12-31T23:59:59Z");
const now = AT;

describe("dueEventStatus", () => {
  it("takes a published event live once its start has passed", () => {
    expect(dueEventStatus({ status: "published", startAt: PAST, endAt: FUTURE }, now)).toBe("live");
  });

  it("leaves a published event alone before its start", () => {
    expect(dueEventStatus({ status: "published", startAt: FUTURE, endAt: FUTURE }, now)).toBeNull();
  });

  it("ends a published event already past its end (never briefly live)", () => {
    expect(dueEventStatus({ status: "published", startAt: PAST, endAt: PAST }, now)).toBe("ended");
  });

  it("ends a live event once its end has passed", () => {
    expect(dueEventStatus({ status: "live", startAt: PAST, endAt: PAST }, now)).toBe("ended");
  });

  it("leaves a live event alone before its end", () => {
    expect(dueEventStatus({ status: "live", startAt: PAST, endAt: FUTURE }, now)).toBeNull();
  });

  it("treats the boundary instant as reached (start == now ⇒ live, end == now ⇒ ended)", () => {
    expect(dueEventStatus({ status: "published", startAt: now, endAt: FUTURE }, now)).toBe("live");
    expect(dueEventStatus({ status: "live", startAt: PAST, endAt: now }, now)).toBe("ended");
  });

  it("stays live open-ended when there is no end date", () => {
    expect(dueEventStatus({ status: "published", startAt: PAST, endAt: null }, now)).toBe("live");
    expect(dueEventStatus({ status: "live", startAt: PAST, endAt: null }, now)).toBeNull();
  });

  it("never advances a draft, or a published event with no start date", () => {
    expect(dueEventStatus({ status: "draft", startAt: PAST, endAt: FUTURE }, now)).toBeNull();
    expect(dueEventStatus({ status: "published", startAt: null, endAt: FUTURE }, now)).toBeNull();
  });

  it("never touches terminal or setup statuses", () => {
    for (const status of ["ended", "archived", "cancelled", "setup"] as const) {
      expect(dueEventStatus({ status, startAt: PAST, endAt: PAST }, now)).toBeNull();
    }
  });
});

describe("dueVoucherStatus", () => {
  it("activates a scheduled voucher once its start has passed", () => {
    expect(dueVoucherStatus({ status: "scheduled", startsAt: PAST, endsAt: FUTURE }, now)).toBe(
      "active",
    );
  });

  it("leaves a scheduled voucher alone before its start", () => {
    expect(
      dueVoucherStatus({ status: "scheduled", startsAt: FUTURE, endsAt: FUTURE }, now),
    ).toBeNull();
  });

  it("expires a scheduled voucher already past its end (never briefly active)", () => {
    expect(dueVoucherStatus({ status: "scheduled", startsAt: PAST, endsAt: PAST }, now)).toBe(
      "expired",
    );
  });

  it("expires active and paused vouchers once their end has passed", () => {
    expect(dueVoucherStatus({ status: "active", startsAt: PAST, endsAt: PAST }, now)).toBe(
      "expired",
    );
    expect(dueVoucherStatus({ status: "paused", startsAt: PAST, endsAt: PAST }, now)).toBe(
      "expired",
    );
  });

  it("leaves an active voucher alone before its end", () => {
    expect(dueVoucherStatus({ status: "active", startsAt: PAST, endsAt: FUTURE }, now)).toBeNull();
  });

  it("treats the boundary instant as reached (start == now ⇒ active, end == now ⇒ expired)", () => {
    expect(dueVoucherStatus({ status: "scheduled", startsAt: now, endsAt: FUTURE }, now)).toBe(
      "active",
    );
    expect(dueVoucherStatus({ status: "active", startsAt: PAST, endsAt: now }, now)).toBe("expired");
  });

  it("activates open-ended when there is no end date", () => {
    expect(dueVoucherStatus({ status: "scheduled", startsAt: PAST, endsAt: null }, now)).toBe(
      "active",
    );
  });

  it("never advances a draft, or a scheduled voucher with no start date", () => {
    expect(dueVoucherStatus({ status: "draft", startsAt: PAST, endsAt: FUTURE }, now)).toBeNull();
    expect(
      dueVoucherStatus({ status: "scheduled", startsAt: null, endsAt: FUTURE }, now),
    ).toBeNull();
  });

  it("never touches terminal statuses", () => {
    for (const status of ["expired", "archived"] as const) {
      expect(dueVoucherStatus({ status, startsAt: PAST, endsAt: PAST }, now)).toBeNull();
    }
  });
});
