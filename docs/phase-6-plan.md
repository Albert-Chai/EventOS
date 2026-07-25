# Phase 6 — Monetization: Implementation Plan

Status: **complete** (migrations 0012/0013 applied + verified live; typecheck +
lint + 160 unit/integration tests + production build green)
Spec: `EventOS_PROJECT.md` §34 (Phase 6), §9 (monetization model / pricing),
§8.7 (featured listings), §8.2 (organizer subscription fields), §22 (billing &
usage control), §14 (`tenant.manage_billing`), §17 (`/dashboard/billing`,
`/platform/plans`), §12 (`plans`, `subscriptions`, `invoices`, `usage_records`,
`featured_placements`).

---

## 1. Scope

Make the platform monetizable: **plans** with **enforced usage limits**, a
**subscription** per tenant, a **simulated upgrade** flow that records **invoices**
and audits, **featured listings** an organizer can grant (gated by plan
entitlement), and a **billing dashboard** that shows plan, usage-vs-limits, and
invoice history.

Meets the four §34 exit criteria: plan limits enforced · organizer can upgrade ·
featured listing tracked · billing events audited.

---

## 2. Decisions (from AskUserQuestion)

| Question              | Choice                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Payment integration   | **Simulated upgrade, defer Stripe.** Plan change → subscription + invoice (paid) + audit; no external payment. Real Stripe Checkout + `/api/webhooks/stripe` is a documented follow-up (like the scheduler / Redis / email-provider deferrals). `PAYMENT_PROVIDER`/`STRIPE_*` are already optional in `env-schema.ts`. |
| Plan definitions      | **Seeded `plans` table.** Catalog + price + `limits` (jsonb) + `features` (text[]); subscriptions FK to it; `/platform/plans` reads it. The metric list + plan values live in code (`server/billing/plans.ts`) and the seed writes them, so enforcement stays typed. |
| Enforcement           | **Full §22 usage metering.** Every §22 metric is represented. The four with a data source — active events, merchants per event, team members, storage bytes — are computed **live** from their tables and **hard-enforced** on create. The event-driven ones (email, SMS, push, QR, API, voucher claims/redemptions) are summed from a `usage_records` ledger that later phases increment via `recordUsage`; their limits display and warn now, enforce as their features land. |

---

## 3. Plan / limit / entitlement model (`server/billing/plans.ts`, code)

Pure, typed, unit-tested — the source of truth the seed writes into `plans`.

- `USAGE_METRICS` — `events`, `merchants_per_event`, `team_members`,
  `storage_bytes`, `email_sends`, `sms_sends`, `push_sends`, `qr_scans`,
  `api_calls`, `voucher_claims`, `voucher_redemptions`.
- `LIVE_METRICS` (computed from source tables) vs `LEDGER_METRICS` (summed from
  `usage_records`); `MONTHLY_METRICS` (reset per calendar month, keyed by a
  `period` like `2026-07`); `HARD_LIMIT_METRICS` (block on create) vs soft
  (warn-only, shown in the dashboard).
- `PLAN_FEATURES` — `custom_branding`, `featured_listings`, `vouchers`,
  `campaigns`, `custom_domain`, `data_export`, `white_label`, `api_access`,
  `sponsor_module`, `merchant_self_service`.
- `PlanTier` = `starter | growth | professional | enterprise`; `PLANS` holds each
  tier's price (sen, MYR), `limits` (`Partial<Record<UsageMetric, number>>`;
  omitted = unlimited), `features`, and `analyticsRetentionDays`, from §9.1.
- Limit math: `usageRatio(current, limit)`, `LIMIT_WARN = 0.8`,
  `wouldExceed(current, limit, delta)` (unlimited when the limit is absent).

`starter`: 1 event, 50 merchants/event, small caps, no featured/vouchers.
`growth`: 200 merchants/event, `featured_listings`+`vouchers`+`campaigns`+
`custom_branding`+`custom_domain`+`data_export`+`merchant_self_service`.
`professional`: 1,000 merchants/event, + `white_label`+`api_access`+
`sponsor_module`. `enterprise`: unlimited, all features.

---

## 4. Schema (migration 0012 generated + 0013 hand-written)

- **`plans`** — NOT tenant-scoped (platform catalog). `key` (unique tier),
  `name`, `description`, `price_cents`, `currency`, `billing_interval`
  (`per_event`), `limits jsonb`, `features text[]`, `analytics_retention_days`,
  `is_active`, `sort_order`, timestamps.
- **`subscriptions`** — tenant-scoped, **one per tenant** (`unique(tenant_id)`).
  `plan_key` FK (the natural key, like `roles`), `status`
  (`trialing|active|past_due|canceled|paused`),
  `current_period_start/end`, `cancel_at_period_end`, `external_ref` (Stripe id,
  null now), `started_at`, `canceled_at`, timestamps.
- **`invoices`** — tenant-scoped. `subscription_id` FK, `plan_key` FK, `number`
  (`INV-{tenantshort}-{seq}`), `amount_cents`, `currency`, `status`
  (`draft|open|paid|void`), `period_start/end`, `issued_at`, `paid_at`,
  `external_ref`, `notes`, timestamps.
- **`usage_records`** — tenant-scoped **append-only ledger** (created_at only, no
  updated_at/trigger, like `visitor_favourites`). `event_id` (nullable), `metric`
  (text ∈ USAGE_METRICS), `quantity` (int), `period` (nullable, `YYYY-MM` for
  monthly metrics), `occurred_at`, `source`, `created_at`.
- **`featured_placements`** — tenant+event-scoped. `participation_id` FK,
  `merchant_id` FK, `placement_type` (`homepage_featured|category_featured|
  search_boost|map_highlight|sponsored_merchant|recommended_merchant`),
  `rank_priority` (int), `starts_at`, `ends_at` (nullable), `payment_status`
  (`included|pending|paid|waived`), `notes`, `created_by`, timestamps. One active
  placement per participation: partial unique index `WHERE ends_at IS NULL`.

0013 (hand-written): `featured_placements.created_by → auth.users` FK,
`set_updated_at` triggers on plans/subscriptions/invoices/featured_placements
(not usage_records), the featured partial unique index, and
`REVOKE ALL … FROM anon, authenticated` on all five. `_journal.json` gets 12 + 13.

---

## 5. Enforcement (`usage.service` + policies)

- `computeUsage(ctx, {eventId?})` → for each metric: `{ current, limit, ratio,
  warn, over }`. Live metrics counted from tables (`events`, participations,
  members, `sum(files.size_bytes)`); ledger metrics summed from `usage_records`
  (+ period for monthly).
- `assertWithinLimit(ctx, metric, {eventId?, delta=1})` — throws
  `PLAN_LIMIT_REACHED` (**402**) when a **hard** metric would exceed. Wired into:
  `createEvent` (events), `addParticipation` (merchants_per_event),
  team invite (team_members), `uploadImage` (storage_bytes). Platform-admin /
  impersonation path is not exempt — the acting tenant's plan still applies.
- `requirePlanFeature(ctx, feature)` — throws `PLAN_FEATURE_REQUIRED` (402) when a
  gated feature (e.g. `featured_listings`) isn't in the tenant's plan.
- `recordUsage(ctx, metric, quantity, {eventId?, period?})` — the ledger writer
  future phases call; here it backs the metering framework and is exercised by
  tests.

---

## 6. Billing / featured surfaces

- **`/dashboard/billing`** (`tenant.manage_billing` — owner, finance): current
  plan + status; a usage panel (all metrics, progress + 80%/100% warnings);
  plan cards with a **simulated** "Switch to this plan" action
  (`changePlan` → update subscription + insert paid invoice + `recordAudit`
  `billing.plan_changed`); invoice history.
- **Featured**: on the organizer's event → merchants screen, a Feature / Unfeature
  action (`merchant.feature` — owner, event_manager, marketing) gated by
  `requirePlanFeature('featured_listings')`. It writes a `featured_placements`
  row, sets `participation.featured_rank` (the Phase 5 directory already orders by
  it), and audits. Public directory + event home show a **Featured** badge.
- **`/platform/plans`** (`requirePlatformAdmin`): read-only catalog of seeded
  plans. `/platform/billing` + `/platform/usage` deferred (documented).

New permission `merchant.feature` (owner, event_manager, marketing). New error
codes `PLAN_LIMIT_REACHED` (402), `PLAN_FEATURE_REQUIRED` (402). New audit actions
`billing.plan_changed`, `merchant.featured`, `merchant.unfeatured`.

---

## 7. Module order

1. Schema + `index.ts`; generate 0012; hand-write 0013; read SQL; migrate.
2. Code core: `server/billing/plans.ts`; error codes; `merchant.feature`
   permission + role wiring; audit actions.
3. Repositories: `plans`, `subscriptions`, `invoices`, `usage-records`,
   `featured-placements`.
4. Services: `plan.service` (resolve tenant plan + subscription, seed-on-first-
   read defaulting to starter), `billing.service` (`changePlan`, `listInvoices`),
   `usage.service` (`computeUsage`, `assertWithinLimit`, `recordUsage`,
   `requirePlanFeature`), `featured.service` (`featureMerchant`,
   `unfeatureMerchant`, `listFeatured`).
5. Enforcement wiring into createEvent / addParticipation / team invite / upload.
6. Actions + pages: billing dashboard, featured action, `/platform/plans`, the
   public Featured badge.
7. Seed: 4 plans; the demo tenant on Growth with a paid invoice and one featured
   merchant.
8. Tests: unit (limit math, entitlements, usage aggregation, invoice number),
   integration (subscription/invoice/audit + usage + featured isolation, hard-
   limit enforcement), e2e (upgrade + feature).
9. Verify + build live; docs + `CLAUDE.md` + memory; commit.

---

## 8. Exit criteria (§34)

- [x] **Plan limits are enforced** — `assertWithinLimit` throws
      `PLAN_LIMIT_REACHED` on the events / merchants-per-event / team / storage
      hard caps (wired into createEvent, addParticipation, inviteMember,
      uploadImage); unit + integration covered.
- [x] **Organizer can upgrade** — `/dashboard/billing` switches plan (simulated),
      updating the subscription and recording a paid invoice.
- [x] **Featured listing is tracked** — a `featured_placements` row + the public
      "★ Featured" badge on the directory/event home + the `featured_rank` boost.
- [x] **Billing events are audited** — `changePlan` (`billing.plan_changed`) and
      feature/unfeature (`merchant.featured` / `merchant.unfeatured`) call
      `recordAudit`.

Standing bars, all met: isolation of subscriptions/invoices/usage/featured proven
by `tests/integration/billing.test.ts`; plan-limit + usage math unit-covered by
`tests/unit/billing-plans.test.ts`; e2e `billing.spec.ts` (upgrade + featured
badge); typecheck / lint / 160 tests / production build green; deployable.

### Planned deviations

| Spec                                          | Actual                                                              | Why                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Payment integration / Stripe (§9.5, §34)      | Simulated upgrade (subscription + paid invoice + audit)             | No Stripe creds here; matches the project's defer-external-provider pattern.    |
| `subscription_items`, `payments` (§12)        | Deferred; one subscription row per tenant, invoices capture history | Not needed for a single-plan-per-tenant MVP; add with real Stripe line items.  |
| Ledger metric enforcement (email/SMS/QR/…)    | Metered + displayed; enforced as their features land                | Those features (Phases 7–8, email/SMS providers) don't exist to increment yet. |
| Featured impression/click tracking (§8.7)     | Placement recorded; view/click analytics deferred to Phase 7        | Belongs with the analytics event pipeline.                                     |
| `/platform/billing`, `/platform/usage` (§17)  | Deferred; `/platform/plans` ships read-only                         | Cross-tenant billing ops aren't a §34 exit criterion.                          |
