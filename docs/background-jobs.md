# Background jobs — the status scheduler

Follow-up work after §34 Phase 8. Not a new build phase; it closes the
long-deferred "job runner" gap noted in `CLAUDE.md` §6 and the Phase 2 status
module (`src/server/events/status.ts` — "a scheduler to advance them by date is
deferred").

## Why

Two things in the platform were written to be driven by time but had nothing
advancing them:

1. **Event lifecycle.** `published → live → ended` was only reachable by an
   organizer clicking. The public site never looked wrong (it derives a *display
   phase* from the dates via `eventPhase` / the `phaseExpr` SQL mirror), but the
   stored `status` — what the organizer dashboard, the audit trail, and any
   future status-gated feature read — drifted from reality.
2. **Voucher lifecycle.** `scheduled → active → expired` had the same problem: a
   `scheduled` voucher never turned itself on, so the status was effectively dead
   without a human. `claimableReason` guarded claims correctly regardless, but the
   stored status was stale.

Separately, the Phase 7 analytics rollup cron (`/api/cron/aggregate-metrics`) was
written and listed in `vercel.json` but described as "scheduling deferred". This
change makes the scheduler a first-class, deployed-by-config concept alongside it.

## What this is NOT

- Not a general queue/worker (no Redis, no durable job table). It is a set of
  **idempotent, set-based sweeps** run on a schedule. That is all the current
  time-driven work needs.
- Not client-triggerable. The endpoint is guarded by `CRON_SECRET` exactly like
  the aggregation job.
- No schema change and **no migration**. It only advances existing `status`
  columns using existing date columns.

## Design

### 1. Pure decision functions (the source of truth, unit-tested)

Mirroring the existing `eventPhase` ↔ `phaseExpr` pattern, the transition rule is
written once as a pure function next to each status machine, and the SQL sweep
mirrors it:

- `dueEventStatus(event, now) → "live" | "ended" | null`
  - `published|live` with `end_at ≤ now` ⇒ `ended` (checked first, so a
    published event already past its end ends rather than briefly going live)
  - `published` with `start_at ≤ now` (and not past end) ⇒ `live`
- `dueVoucherStatus(voucher, now) → "active" | "expired" | null`
  - `scheduled|active|paused` with `ends_at ≤ now` ⇒ `expired`
  - `scheduled` with `starts_at ≤ now` (and not past end) ⇒ `active`

Both use `≤`/`≥` boundaries consistent with `claimableReason` (at the end
instant, the window is over). Every target is a legal move in the existing
transition machines — the scheduler never invents an edge.

### 2. Repository — `scheduler.repository.ts`

The one place that runs **system-wide, cross-tenant** sweeps. Each function:

- Selects the due rows `FOR UPDATE` (so two overlapping cron runs serialize and
  never double-process a row), capturing the *old* status for the audit `before`.
- Updates them to the target status in the same transaction.
- Returns `{ id, tenantId, from, to }[]` for the service to audit.

Four sweeps: `markEventsEnded`, `markEventsLive`, `markVouchersExpired`,
`markVouchersActive`. Idempotent by construction — the `WHERE` re-filters on the
source status, so a second run finds nothing.

Each takes `now: Date` (injected, never `now()` in SQL) and an optional
`scope.tenantId`. **Production omits the scope** (global sweep); tests pass a
fresh tenant id so a run is hermetic and can never mutate seeded/other-suite rows.
This is not tenant *scoping* in the §1 sense — there is no client and no
membership; it is an optional narrowing, and the value is never client-derived.

### 3. System audit (null actor)

Every transition is a state change, so §23 says audit it. But a cron has no
`ctx.user`. `audit_logs.actor_user_id` is already nullable (platform-level lines
use it), so:

- `insertAuditLogs(entries[])` — batch insert (audit repository).
- `recordSystemAudits(entries[])` — maps to `NewAuditLog` with
  `actor_user_id = null`, `via_impersonation = false`,
  `user_agent = "system/scheduler"`, `after = { status, by: "scheduler" }`.
  Best-effort (a failed audit is logged, never rolls back the transition — same
  philosophy as `recordAudit`).

The audit row carries the affected row's own `tenant_id` (read from the row, not
a client), so it shows up in that organizer's own audit view as a system action.

### 4. Service — `runStatusScheduler({ now?, tenantId? })`

Runs the four sweeps (ended → live, expired → active), writes the batched system
audits, logs a summary, and returns
`{ eventsLive, eventsEnded, vouchersActivated, vouchersExpired }`.

### 5. Route + schedule

- `requireCronAuth(request)` extracted to `src/lib/api/cron-auth.ts` (constant-time
  `CRON_SECRET` bearer check: `503 NOT_CONFIGURED` when unset, `401` on mismatch).
  Both cron routes use it; `aggregate-metrics` is refactored onto it too.
- `GET /api/cron/run-scheduler` — `withApi` wrapper → `requireCronAuth` →
  `runStatusScheduler()`.
- `vercel.json` gains a second cron (`*/15 * * * *`). Inert until deployed with a
  `CRON_SECRET`; sub-daily cadence needs a Vercel plan that allows it, and the
  endpoint is equally callable by any external scheduler holding the bearer token.
  15 minutes is fine because the public *display* phase is already date-derived —
  the sweep only needs to keep the stored status honest, not drive the UI.

## Tests

- **Unit** (`tests/unit/scheduler.test.ts`) — `dueEventStatus` / `dueVoucherStatus`
  across every source status and each side of the start/end boundary, including
  the published-past-end ⇒ ended precedence and the null-date open-ended cases.
- **Integration** (`tests/integration/scheduler.test.ts`, skipped without
  `DIRECT_DATABASE_URL`) — a fresh tenant with due and not-yet-due events and
  vouchers; assert the right rows move, a control row (future start) does not,
  system audit rows are written with a null actor, and a second run is a no-op
  (idempotent). Scoped to the throwaway tenant so it never touches seed data.

## Exit criteria

- [ ] `dueEventStatus` / `dueVoucherStatus` pure and unit-tested.
- [ ] Four idempotent sweeps behind the repository layer, `now` injected.
- [ ] Transitions system-audited with a null actor and the row's own tenant.
- [ ] `/api/cron/run-scheduler` guarded by `CRON_SECRET`; both crons in `vercel.json`.
- [ ] `pnpm verify` + `pnpm build` green; integration test passes against the live DB.
- [ ] No schema change, no migration.

## Still deferred (unchanged)

Real email/push provider, Redis rate limiting, recent-auth, Stripe, the platform
billing/usage dashboards. A durable job/queue table is only worth adding if a
future job needs retries or fan-out that a cron sweep can't express.
