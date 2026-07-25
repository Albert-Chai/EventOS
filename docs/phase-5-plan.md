# Phase 5 — Visitor Experience: Implementation Plan

Status: **complete** (verified live on `nhrnkfbabzdfpxpqbhhc`; migrations 0010/0011
applied; typecheck + lint + 140 unit/integration tests + production build green)
Spec: `EventOS_PROJECT.md` §34 (Phase 5), §7.3 (visitor discovery journey), §8.8
(visitor features), §8.9 (search & filtering), §8.3 (`enable_favourites`,
`enable_guest_browsing`, `require_visitor_login`), §17 (`/merchants`,
`/favourites` public routes), §18 (visitor UX), §19 PWA.

---

## 1. Scope

Turn the public event site into something a visitor can actually explore on a
phone: browse and **search** the merchant directory, **filter** by category /
zone / dietary / price, **favourite** merchants, see what they **recently
viewed**, **share** a listing, and **install** the site as a PWA.

**In scope**

- A **searchable, filterable merchant directory** for an event (Postgres FTS).
- **Anonymous, server-side visitor identity** — an httpOnly cookie id backs a
  `visitors` row created lazily on first action; no login (guest browsing).
- **Favourites** (`visitor_favourites`) — save/unsave a merchant, a favourites page.
- **Recently viewed** (`visitor_recent_views`) — tracked on merchant view, shown
  as a strip.
- **Share** — Web Share API with a copy-link fallback.
- **PWA** — a per-event web manifest, installable prompt, a network-first service
  worker with an offline fallback page, and icons.
- Event-home polish: search entry, category chips, favourites/map shortcuts.

**Out of scope** (later phases / a focused follow-up)

- **Reviews & ratings** (§8.11) and the "Rating" filter — a separate feature
  (`reviews` table), not a Phase 5 deliverable.
- **Personal itinerary** (`visitor_itineraries`) and **visitor profiles /
  registration** (`visitor_event_profiles`, marketing consent) — §8.8 lists them
  but §34 Phase 5 is directory/search/filters/favourites/recent/share/PWA. The
  anonymous→account link is deferred.
- **Featured / sponsor** filters and management (Phase 6 — `featured_rank` exists;
  the directory *orders* by it but nothing sets it yet).
- **Open-now / QR-scan history / saved vouchers** filters (need merchant hours /
  Phase 7–8 data).
- **Full offline caching** — the SW is network-first with an offline fallback,
  not a page cache (avoids staleness on a dynamic multi-tenant site).

---

## 2. Decisions (from AskUserQuestion)

| #          | Decision                        | Consequence                                                                                                                                                              |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visitor ID | **Anonymous cookie + server**   | An httpOnly `eventos_vid` cookie (opaque uuid) backs a `visitors` row, created lazily on the first favourite/view. Favourites & recent-views persist server-side, no login. Account-linking (`user_id`) is a reserved column, deferred. |
| Search     | **Postgres full-text**          | `websearch_to_tsquery` over a query-time `to_tsvector` across merchant + listing + item + booth + category + zone text, ranked. No stored vector/trigger — a seq scan over one event's approved set (fine at MVP scale). |
| PWA        | **Manifest + install + offline**| Per-event dynamic manifest (name, theme colour, icons), an install prompt, and a network-first SW with a cached `/offline` fallback. Installable without stale-content risk. |

---

## 3. Visitor identity — anonymous, lazy, cookie-backed

The isolation contract still holds: a visitor is **not** derived from tenant
membership, but favourite/recent rows are scoped to the tenant + event resolved
from the **public URL** (`findPublicEvent` → `tenant_id`, `event_id`), never a
client value — the §6 "public reads filter, they don't scope" pattern, extended
to the visitor's own writes.

- The `eventos_vid` cookie holds an opaque uuid (the `anonymous_id`). It is
  **httpOnly, SameSite=Lax, Secure in prod, 1-year**, set the first time a
  visitor favourites or views — cookies can only be written from a Server Action /
  route handler, and an anonymous pageview creates nothing.
- `resolveVisitor()` (in the visitor service) reads the cookie; if present it
  finds-or-creates the `visitors` row, else it mints an id, sets the cookie, and
  inserts the row. A visitor row is created only on a real action, not per view.
- A visitor can only ever read/mutate **their own** rows (keyed on the cookie's
  visitor id). Server Components read the cookie (`cookies()` is readable in RSC)
  to mark favourited cards and render the favourites/recent lists.
- `visitors` is global (like `profiles`), not tenant-scoped: one device can favourite
  across several organizers' events, and each organizer only ever sees rows scoped
  to their own tenant. `user_id` (→ `auth.users`) is reserved for a future link.

---

## 4. Schema (migration 0010 generated + 0011 hand-written)

```
visitors(id, anonymous_id text UNIQUE, user_id uuid?, display_name?, email?,
         last_active_at, created_at, updated_at)
         -- user_id → auth.users SET NULL (hand-written), reserved for account link

visitor_favourites(id, visitor_id→visitors, tenant_id→tenants, event_id→events,
         participation_id→participations, merchant_id→merchants, created_at)
         -- UNIQUE(visitor_id, participation_id)

visitor_recent_views(id, visitor_id→visitors, tenant_id→tenants, event_id→events,
         participation_id→participations, merchant_id→merchants,
         viewed_at, created_at, updated_at)
         -- UNIQUE(visitor_id, participation_id); viewed_at bumped on re-view (upsert)
```

Same-schema FKs (`tenant_id`, `event_id`, `participation_id`, `merchant_id`,
`visitor_id`) are in the schema files (generated 0010). Hand-written 0011 carries
the cross-schema `visitors.user_id → auth.users` FK, the `set_updated_at`
triggers, and the `REVOKE ALL … FROM anon, authenticated` on all three tables —
these tables are reached only through the server, never PostgREST.

`visitor_favourites`/`visitor_recent_views` carry `tenant_id` + `event_id` so a
read scopes to the event and future analytics can aggregate per tenant. They
cascade on both `visitor` delete and `event` delete.

---

## 5. Directory search & filters (`directory.repository.ts`)

One parameterized query over an event's **public** set (approved participation,
active merchant), built as raw `sql` (Drizzle parameterises interpolations):

```
WITH item_facts AS (                       -- one row per participation
  SELECT participation_id,
         bool_or(is_halal)          AS has_halal,
         min(price)                 AS min_price,
         max(coalesce(promo_price,price)) AS max_price,
         bool_or(promo_price IS NOT NULL)  AS has_promo,
         string_agg(name||' '||coalesce(description,'')||' '
                    ||array_to_string(dietary_tags,' '), ' ') AS item_text,
         array_agg(DISTINCT lower(t)) FILTER (…)             AS diet_tags
  FROM listing_items … GROUP BY participation_id
)
SELECT …, ts_rank(document, q) AS rank
FROM participations p
  JOIN merchants m …            -- approved + active + not deleted
  LEFT JOIN merchant_categories c …
  LEFT JOIN item_facts f …
  LEFT JOIN LATERAL (active assignment → booth → zone) z …
WHERE p.event_id = $event AND p.approval_status='approved' AND m.status='active'
  [AND document @@ websearch_to_tsquery('simple', $q)]     -- when searching
  [AND m.category_id = $category]
  [AND z.zone_id = $zone]
  [AND f.has_halal]                                          -- halal
  [AND $diet = ANY(f.diet_tags)]                             -- vegetarian/…
  [AND f.max_price >= $min AND f.min_price <= $max]          -- price overlap
  [AND f.has_promo]                                          -- promotion
ORDER BY (rank when searching) DESC, p.featured_rank NULLS LAST, m.name
```

`document` = `to_tsvector('simple', merchant name || listing title/desc ||
category || item_text || booth number || zone name)`. Facets available to the UI
(category list, zone list) come from the event's zones + the categories in use.

Deferred filters (featured, sponsor, open-now, rating) are documented, not wired.

---

## 6. Module order

1. Schema files + `index.ts`; generate 0010; hand-write 0011; read SQL; migrate.
2. Repositories: `visitors`, `visitor-favourites`, `visitor-recent-views`, and
   `directory` (the FTS/filter query + facet lists).
3. Services: `visitor.service` (resolveVisitor, toggleFavourite, recordView,
   listFavourites, listRecentViews) and `directory.service` (search + facets).
4. Feature layer: `features/visitors/` — public actions (toggle favourite, record
   view), schemas, and components (FavouriteButton, ShareButton, SearchBar,
   FilterBar, MerchantCard, RecentlyViewed, InstallPrompt, ServiceWorkerRegister).
5. Public pages: the directory (`/[tenant]/[event]/merchants`) with search +
   filters, favourites (`/[tenant]/[event]/favourites`), the merchant detail's
   favourite/share/record-view, and event-home polish; the `/offline` page.
6. PWA: a dynamic `manifest.webmanifest` route per event, static icons, a static
   `sw.js` (network-first + offline fallback), registration + install prompt in
   the public layout.
7. Seed: a couple of favourites + recent views for the demo visitor (optional).
8. Tests: unit (the filter/param builder), integration (favourite/recent
   isolation + the directory query), e2e (search → filter → favourite → the
   favourites page).
9. Migrate + seed + verify live; docs + `CLAUDE.md` + memory; commit.

---

## 7. Exit criteria (§34)

- [x] **Visitor can browse quickly on mobile** — the directory
      (`/[tenant]/[event]/merchants`) has debounced full-text search, category /
      zone / halal / promo filter chips, and per-card favourite; the merchant
      detail adds favourite + share; the event home surfaces recently-viewed and
      quick links. All designed at 390px first.
- [x] Favourites and recent-views persist for a returning anonymous visitor —
      keyed off the `eventos_vid` httpOnly cookie the favourite/view actions mint.
- [x] The site is installable — per-event `manifest.webmanifest`, an install
      banner, and a network-first service worker with an `/offline` fallback.

Standing bars, all met: favourite/recent isolation + the directory query proven
by `tests/integration/visitor-directory.test.ts`; the filter/param builder
unit-covered by `tests/unit/directory-filters.test.ts`; the public seam holds
(only approved + active merchants; tenant/event resolved from the URL, never a
client value); typecheck / lint / 140 tests / production build green; deployable.

### Planned deviations

| Spec                                   | Actual                                                     | Why                                                                             |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Visitor profile / registration (§8.8)  | Anonymous cookie only; `user_id` reserved                  | Guest browsing + fast mobile first; the account link is a focused follow-up.    |
| Itinerary (§8.8)                       | Deferred                                                   | Not a §34 Phase 5 deliverable; favourites cover "save for later" for MVP.       |
| Reviews / rating filter (§8.11)        | Deferred                                                   | Separate feature (`reviews` table); no phase claims it yet.                     |
| Open-now / featured / sponsor filters  | Deferred (directory orders by `featured_rank`)             | Need merchant hours / Phase 6–7 data; the filter shells can land later.         |
| Full offline PWA                       | Network-first + offline fallback page                      | Page caching risks stale content on a dynamic multi-tenant site.                |
| Dietary + explicit price-range filters | Supported in the directory query; no UI chip yet           | Halal/category/zone/promo chips cover the MVP; diet/price shells land later.     |
