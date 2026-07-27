# Platform admin console — billing, usage & analytics

Follow-up after the status scheduler. Fills out the platform-admin surface
(`app/(platform)`) with the three god's-eye views that were thin or missing:
cross-tenant **billing**, **usage**, and **analytics**. No schema change, no
migration — these are read-only aggregations over data other phases already write.

## Scope

Three new pages under `/platform`, each guarded by
`requirePlatformAdminOrRedirect` (the layout guards too; §14 — every page
re-checks):

1. **`/platform/billing`** — the money view. Total *simulated* revenue (sum of
   paid invoices), count of paying tenants, plan distribution across tiers, a
   per-tenant table (plan, subscription status, period end, invoice count), and
   the most recent invoices across all tenants.
2. **`/platform/usage`** — the capacity view. Per-tenant usage of the hard/live
   metrics (active events, team members, storage) against that tenant's plan
   limits, flagging anyone near or over; plus platform totals (events, storage)
   and a count of tenants over any hard limit.
3. **`/platform/analytics`** — the engagement view. Read **live from the raw
   `analytics_events` log** (same "metrics match logs" bar as the organizer
   dashboards): total tracked events, unique visitors, top event names, and a
   per-tenant engagement breakdown.

Nav gets three entries; the overview page gets headline numbers + quick links.

## Authority & isolation

This is the **platform authority** axis (§3.2), not tenant scoping. Platform
admins are explicitly allowed to see across tenants — exactly like the existing
`listTenants()` and platform-wide `listAuditLogs({})`. The new repository reads
are therefore **deliberately unscoped** (no `tenant_id` predicate) and documented
as *platform-admin only; the caller must gate*. They are imported only by pages
that call `requirePlatformAdminOrRedirect` first. No client value reaches any of
them — tenant ids come from `listTenants()`/the rows themselves.

This does not weaken §1: a tenant *user* still can't reach another tenant's data
(those paths stay tenant-scoped). Only the platform-admin axis crosses tenants,
by design.

## Layers

- **Repository** — add platform-wide reads next to the existing tenant-scoped ones:
  - `subscriptions`: `listAllSubscriptions()`
  - `invoices`: `platformInvoiceTotals()` (paid count + summed cents),
    `listRecentInvoicesAcrossTenants(limit)` (joined to tenant name)
  - `analytics-events`: `platformAnalyticsTotals()`, `platformEventsByName(limit)`,
    `platformEventsPerTenant()` (joined to tenant name)
- **Pure module** `src/server/platform/summary.ts` — the logic worth unit-testing
  without a DB: `planDistribution(planKeys)`, `countUsageFlags(usage)`. Kept pure so
  the transition from rows → summary is deterministic and testable.
- **Service** `platform.service.ts` — `getPlatformBilling()`, `getPlatformUsage()`,
  `getPlatformAnalytics()`. Each assembles repo reads + the code plan definitions
  (`getPlan`/`PLANS`) + `computeUsage` per tenant. No `ctx` (platform-wide); the
  page owns the guard, matching how `listTenants()` is called today.
- **Pages** — Server Components under `app/(platform)/platform/{billing,usage,
  analytics}`, reusing `formatPlanPrice`, `formatMetricValue`, the `UsagePanel`
  bar styling, and the shared `Card`/`Table` primitives.

## Honesty in the UI

- Revenue is labelled **simulated** everywhere it appears (billing is simulated
  until Stripe lands — §22 / `CLAUDE.md` §6).
- Priced plans bill `per_event`, not monthly, so the console shows **total
  simulated revenue** (from invoices) and **paying-tenant count** — never a
  fabricated "MRR" that implies a monthly cadence.
- Per-tenant usage is computed on demand — O(tenants) × the live-metric queries.
  Fine at current scale; noted as a future concern if tenant counts grow large.

## Tests

- **Unit** (`tests/unit/platform-summary.test.ts`) — `planDistribution` (counts by
  tier, zero-fills absent tiers) and `countUsageFlags` (over vs warn tallies,
  ignores soft/unlimited).
- **Integration** (`tests/integration/platform-console.test.ts`, skipped without
  `DIRECT_DATABASE_URL`) — because these reads are global, assert on a **freshly
  created throwaway tenant's own row** (correct plan, usage, engagement) rather
  than brittle global totals, and that platform totals are ≥ that tenant's
  contribution. Cleans up by tenant cascade.

## Exit criteria

- [ ] Three pages live under `/platform`, each re-gated, with loading/empty states.
- [ ] Platform-wide repo reads documented as admin-only + unscoped by design.
- [ ] Revenue labelled simulated; no misleading MRR.
- [ ] Pure summarizers unit-tested; integration test proves per-tenant correctness.
- [ ] `pnpm verify` + `pnpm build` green. No schema change, no migration.
