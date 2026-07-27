# Phase 7 — Analytics: Implementation Plan

Status: **in progress**
Spec: `EventOS_PROJECT.md` §34 (Phase 7), §8.13 (analytics dashboards), §8.10 (QR
codes), §25 (analytics event taxonomy), §14 (`analytics.view`,
`analytics.export`), §12 (`analytics_events`, `daily_event_metrics`,
`daily_merchant_metrics`, `qr_codes`, `qr_scan_events`).

---

## 1. Scope

Give organizers and merchants engagement analytics backed by a raw event log:

- an **append-only `analytics_events` ledger** (the §25 taxonomy) captured from a
  **client beacon** on public pages plus **server-side action seams** (favourite,
  share, QR scan);
- **QR codes** that resolve through a trackable `/q/{shortCode}` redirect and log
  every scan, with a rendered (scannable) QR image on the dashboards;
- an **organizer analytics dashboard** (per event) and a **merchant analytics
  dashboard**, both **reading live from the raw log** so the numbers always match
  it (the §34 exit criterion);
- **daily rollup tables** (`daily_event_metrics`, `daily_merchant_metrics`) filled
  by an **idempotent aggregation job** exposed at a **`CRON_SECRET`-guarded
  `/api/cron/aggregate-metrics`** route (the "daily aggregation job"); and
- **CSV exports** of both dashboards (gated by `analytics.export`).

Meets the three §34 exit criteria: organizer sees event engagement · merchant sees
listing engagement · metrics match the raw event logs.

---

## 2. Decisions (from AskUserQuestion)

| Question       | Choice                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event capture  | **Client `<Track>` beacon + server-side at action seams.** A small client component fires a public `trackEvent` action once on mount (`event_viewed`, `merchant_list_viewed`, `merchant_viewed`, `search_performed`, `filter_applied`, `map_opened`, `share_clicked`); the server records `merchant_favourited`/`_unfavourited` inside `setFavourite` and `qr_scanned` inside the redirect. Needs JS, so bots/prefetches are excluded; tenant + event are resolved from the URL slugs (`findPublicEvent`), never a client value (the §6 public seam). |
| Aggregation    | **Live-from-raw + rollup tables + cron route.** Dashboards aggregate directly from `analytics_events` (so they match the log). `daily_event_metrics` + `daily_merchant_metrics` + an idempotent `runDailyAggregation(date)` behind a `CRON_SECRET`-guarded `/api/cron/aggregate-metrics` route provide per-day series; live scheduling is deferred (documented `vercel.json` cron), like the status scheduler. |
| QR codes       | **Full: rendered image + tracking.** Add the `qrcode` dependency to render scannable QR images (PNG data-URI, self-contained) for the event homepage and merchant listings, plus a `/q/[code]` redirect route that logs a `qr_scan_events` row + an `analytics_events` `qr_scanned` row and 302s to the (retargetable) destination. |

**Stated reason for the new dependency** (`CLAUDE.md` §7.8): `qrcode` (MIT,
widely used) encodes the trackable `/q/{shortCode}` links into scannable images
server-side (`toDataURL`). Reimplementing a QR encoder (Reed–Solomon, masking,
version selection) by hand would be far more code and error-prone. `@types/qrcode`
is added as a dev dependency for the strict-TS build.

---

## 3. Event taxonomy (`server/analytics/taxonomy.ts`, code)

Pure, typed, unit-tested — the source of truth for event names and which ones a
client is allowed to emit.

- `ANALYTICS_EVENTS` — the full §25 union: `page_viewed`, `event_viewed`,
  `merchant_list_viewed`, `merchant_viewed`, `merchant_searched`,
  `search_performed`, `filter_applied`, `map_opened`, `booth_selected`,
  `merchant_favourited`, `merchant_unfavourited`, `item_viewed`, `qr_scanned`,
  `voucher_viewed`, `voucher_claimed`, `voucher_redeemed`, `review_submitted`,
  `share_clicked`, `visitor_registered`, `pwa_installed`, `notification_opened`.
  Defined in full for a stable contract; Phase 7 **emits a subset**, later phases
  emit the rest (vouchers/reviews/booth/item), exactly as permissions and audit
  actions were defined ahead of use.
- `CLIENT_TRACKABLE` — the subset a public beacon may send (`event_viewed`,
  `merchant_list_viewed`, `merchant_viewed`, `search_performed`, `filter_applied`,
  `map_opened`, `share_clicked`, `pwa_installed`). Favourite + QR events only ever
  originate server-side, so the beacon can't forge them.
- `ROLLUP_METRICS` — derived keys the aggregation adds beyond raw name counts:
  `unique_visitors` (distinct `anonymous_id`), `total_events`.
- Device / source helpers live in `src/lib/client-signals.ts` (pure): a tiny
  `parseUserAgent(ua)` → `{ deviceType, browser }` and
  `deriveTrafficSource(referrer, selfHost)` → `direct | internal | <host>`. No
  UA-parsing dependency — a small documented regex set is enough for
  mobile/tablet/desktop/bot + the major browsers.

`QR_TARGET_TYPES` — `event`, `merchant`, `booth`, `item`, `voucher`,
`passport_checkpoint`, `staff_verification`, `visitor_registration`, `url`
(§8.10). Phase 7 generates `event` + `merchant` codes.

---

## 4. Schema (migration 0014 generated + 0015 hand-written)

All tenant-scoped; all repeat the `REVOKE ALL … FROM anon, authenticated`.

- **`analytics_events`** — append-only ledger (created_at only, no updated_at /
  trigger, like `usage_records`). `tenant_id` (FK, notNull), `event_id`,
  `merchant_id`, `participation_id`, `item_id`, `booth_id`, `zone_id` (nullable
  FKs, cascade), `visitor_id` (nullable FK `visitors`), `anonymous_id` (text — the
  `eventos_vid` cookie, the unique-visitor key), `campaign_id` (nullable uuid, no
  FK yet — Phase 8), `name` (text ∈ `ANALYTICS_EVENTS`), `source`, `device_type`,
  `browser`, `referrer` (text nullable), `props` (jsonb — event-specific extras
  e.g. search `q`, filter keys, share channel), `occurred_at`, `created_at`.
  Indexes: `(tenant_id)`, `(event_id, name)`, `(event_id, occurred_at)`,
  `(participation_id)`, `(merchant_id)`.
- **`daily_event_metrics`** — rollup, upserted. `tenant_id` + `event_id` (FK), a
  `date` (date), `metric` (text — an analytics name or a `ROLLUP_METRICS` key),
  `value` (int), timestamps (+ trigger). `unique(event_id, date, metric)`.
- **`daily_merchant_metrics`** — rollup, upserted. `tenant_id`, `event_id`,
  `merchant_id`, `participation_id` (FK), `date`, `metric`, `value`, timestamps
  (+ trigger). `unique(participation_id, date, metric)`.
- **`qr_codes`** — mutable (retarget / disable ⇒ has updated_at + trigger).
  `tenant_id` (FK), `event_id`, `merchant_id`, `participation_id` (nullable FKs),
  `short_code` (text, **globally unique**), `target_type` (text ∈
  `QR_TARGET_TYPES`), `target_id` (nullable uuid), `target_path` (text — the
  retargetable relative destination), `label`, `scan_count` (int default 0, a
  denormalized counter; the ledger is authoritative), `is_active` (bool default
  true), `expires_at` (nullable), `created_by` (uuid → `auth.users` in 0015),
  timestamps. `unique(short_code)`; a partial unique index keeps **one active code
  per (target_type, target_id)** `WHERE target_id IS NOT NULL AND is_active`.
- **`qr_scan_events`** — append-only (created_at only). `tenant_id` (FK),
  `qr_code_id` (FK cascade), `short_code`, `target_type`, `target_id`, `event_id`,
  `merchant_id` (nullable FKs), `visitor_id` (nullable FK), `anonymous_id`,
  `device_type`, `browser`, `referrer`, `country` (text — **approximate location
  only**, from `x-vercel-ip-country`; precise geo is never stored, per §8.10),
  `scanned_at`, `created_at`. Indexes `(qr_code_id)`, `(event_id)`, `(tenant_id)`.

0015 (hand-written): `qr_codes.created_by → auth.users` FK (SET NULL); the
`qr_codes` open-target partial unique index; `set_updated_at` triggers on
`daily_event_metrics`, `daily_merchant_metrics`, `qr_codes` (the two append-only
ledgers get none); and `REVOKE ALL … FROM anon, authenticated` on all five.
`_journal.json` gets idx 14 + 15.

---

## 5. Capture pipeline

- **`trackEventAction(input)`** (`features/analytics/actions.ts`, `"use server"`,
  public) — validates `{ name ∈ CLIENT_TRACKABLE, tenantSlug, eventSlug,
  merchantSlug?, props? }` with Zod; resolves the public event (and merchant) from
  slugs; ensures the `eventos_vid` cookie (mints it **without** creating a
  `visitors` DB row — the cookie is the anonymous-id, browsing still writes no
  visitor row); parses UA + referrer from headers; inserts one
  `analytics_events` row. Best-effort: never surfaces an error to the visitor.
- **`<Track>`** (`features/analytics/components/track.tsx`, client) — fires
  `trackEventAction` once on mount (the Phase 5 `RecordView` pattern). Mounted on
  the public event page (`event_viewed`), merchants directory
  (`merchant_list_viewed`, + `search_performed`/`filter_applied` when the URL
  carries `q`/filters), merchant detail (`merchant_viewed`), and map
  (`map_opened`). Share button fires `share_clicked`.
- **Server seams** — `setFavourite` records `merchant_favourited` /
  `merchant_unfavourited` (it already resolves tenant/event/merchant/visitor); the
  `/q` redirect records `qr_scanned`. These never depend on the client beacon.

`recordAnalyticsEvent(...)` is the single writer (a thin
`analytics.service` helper over the repository); all callers pass
server-derived ids.

---

## 6. QR codes

- **`getOrCreateEventQrCode` / `getOrCreateMerchantQrCode`** (`qr.service`) —
  idempotent by `(tenant, target_type, target_id)`; generates a base62
  `short_code`, stores the retargetable `target_path`, audits `qr.code_created`
  on first creation. Returns `{ shortCode, url, scanCount }`; the dashboard action
  renders `QRCode.toDataURL(url)` → an `<img>`.
- **`/q/[code]/route.ts`** (public GET, `runtime nodejs`) — looks up the code by
  `short_code` (active + unexpired); on a hit, records the scan (`qr_scan_events`
  + `scan_count` bump + `analytics_events` `qr_scanned`) and **302s** to
  `target_path`; on a miss/expired, redirects to the app root. Device/browser from
  UA, `country` from `x-vercel-ip-country`, anon from the cookie (not minted here).
- Retarget / disable UI is deferred (documented); `is_active` + `expires_at` +
  `target_path` are in the schema so it is a UI-only follow-up.

New audit actions `qr.code_created`, `qr.code_updated`. QR generation is an
organizer mutation and is audited; the high-volume anonymous tracking writes are
**not** audited (§23 audits actor state-changes, not visitor telemetry).

---

## 7. Aggregation

- **`runDailyAggregation(date?)`** (`analytics-aggregation.service`, default
  yesterday UTC) — for the day, `DELETE` that date's rollup rows then
  `INSERT … SELECT … GROUP BY` from `analytics_events` (name counts +
  `unique_visitors` distinct-anon + `total_events`) into `daily_event_metrics`,
  and per `participation_id` into `daily_merchant_metrics`. Idempotent (re-runs
  recompute); all SQL lives in the repository layer.
- **`/api/cron/aggregate-metrics/route.ts`** — `withApi`, but first checks
  `Authorization: Bearer ${CRON_SECRET}`: **503 `NOT_CONFIGURED`** if the secret
  is unset, **401** on mismatch. Accepts `?date=YYYY-MM-DD` to backfill. Returns
  `{ date, eventRows, merchantRows }`.
- **`vercel.json`** wires a daily `00:15 UTC` cron to that path — inert locally
  and until `CRON_SECRET` is set + the app is deployed (the route 503s until
  then), so scheduling is effectively deferred like the status scheduler.

---

## 8. Dashboards + export

- **Organizer** — `/dashboard/events/[eventId]/analytics` (`analytics.view`).
  Reads **live from raw** via `getEventAnalytics(tenantId, eventId, {from,to})`:
  total events, unique visitors, merchant views, searches, favourites, map opens,
  QR scans; top merchants, top search keywords, top categories; device + traffic
  source breakdowns; a daily-active-users series. A range selector (`?days=7|30|90`,
  default 30). The event QR image + short link + scan count. An **Export CSV**
  link (`analytics.export`). An "Analytics" link is added to the event overview.
- **Merchant** — `/merchant/[merchantId]/analytics` (`requireMerchantMember`).
  `getMerchantAnalytics(tenantId, merchantId, {from,to})`: listing views,
  favourites, QR scans, map opens, per-event breakdown; product views / voucher
  claims-redemptions / search appearances shown as **upcoming** (Phase 8 / not yet
  instrumented). The merchant QR image + link. Export CSV. Link from merchant home.
- **CSV** — `src/lib/csv.ts` `toCsv(rows, columns)` (hand-rolled RFC-4180 escaping,
  no dependency). Export routes authorize (`analytics.export` / merchant
  membership) then stream `text/csv` with `Content-Disposition`.

Live-from-raw is what makes "metrics match the raw event logs" true **by
construction**; the rollup tables are a separate, tested surface (a test asserts
`runDailyAggregation` reproduces the live counts for a date).

---

## 9. Module order

1. Schema + `index.ts`; generate 0014; hand-write 0015; read SQL; migrate.
2. Code core: `server/analytics/taxonomy.ts`; `lib/client-signals.ts`; `lib/csv.ts`;
   audit actions; `qrcode` + `@types/qrcode` deps.
3. Repositories: `analytics-events`, `daily-metrics`, `qr-codes`, `qr-scan-events`
   (+ the grouped-count / aggregation queries).
4. Services: `analytics.service` (`recordAnalyticsEvent`, `getEventAnalytics`,
   `getMerchantAnalytics`), `analytics-aggregation.service`, `qr.service`.
5. Capture: `trackEvent` action + `<Track>`; favourite + share + QR seams.
6. QR redirect route; cron route + `vercel.json`.
7. Dashboards (organizer + merchant) + CSV export routes + nav links.
8. Seed: QR codes + a spread of raw events over ~5 days + scans; aggregate them
   into the rollup tables.
9. Tests: unit (UA/source parsing, CSV escaping, taxonomy guards, short-code),
   integration (event/merchant analytics counts + isolation, aggregation ==
   live, QR scan pipeline, unique visitors), e2e (`/q` redirect + auth gate).
10. Verify + build live; docs + `CLAUDE.md` + memory; commit to main.

---

## 10. Exit criteria (§34)

- [ ] **Organizer can see event engagement** — `/dashboard/events/[id]/analytics`.
- [ ] **Merchant can see listing engagement** — `/merchant/[id]/analytics`.
- [ ] **Metrics match raw event logs** — dashboards aggregate live from
      `analytics_events`; `runDailyAggregation` reproduces the same counts
      (integration-tested), so the rollup matches too.

Standing bars: isolation of analytics/QR proven by
`tests/integration/analytics.test.ts`; taxonomy / signal / CSV math unit-covered;
e2e for the `/q` redirect + the dashboard auth gate; typecheck / lint / tests /
production build green; deployable.

### Planned deviations

| Spec                                              | Actual                                                              | Why                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Cron scheduling (§34 "daily aggregation jobs")    | Route + idempotent job ship; `vercel.json` cron is inert until deploy + `CRON_SECRET` | No job runner in this env; mirrors the deferred status scheduler.       |
| Platform analytics dashboard (§8.13)              | Deferred; organizer + merchant dashboards ship                     | Not a §34 Phase 7 exit criterion; needs the cross-tenant platform surface. |
| Merchant "product views / voucher / search appearances" (§8.13) | Shown as upcoming                                    | Vouchers are Phase 8; product-view + search-appearance instrumentation lands with those surfaces. |
| QR retarget / disable UI (§8.10)                  | Schema supports it (`is_active`, `target_path`, `expires_at`); UI deferred | MVP generates + displays + tracks; editing is a pure UI follow-up.      |
| UA / geo parsing library                          | Small in-repo `parseUserAgent` + `x-vercel-ip-country` only        | Avoids a dependency; precise location deliberately not stored (§8.10).  |
