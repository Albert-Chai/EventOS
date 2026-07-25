# Architecture

Current as of Phase 6. Update this file whenever the shape changes
(spec §33.2 rule 7).

---

## 1. Runtime topology

```
                    ┌─────────────────────────┐
                    │  Visitors / Organizers  │
                    │  Mobile web · PWA       │
                    └────────────┬────────────┘
                                 │  HTTPS
                    ┌────────────▼────────────┐
                    │       proxy.ts          │  Edge
                    │  session refresh        │  refreshes the Supabase
                    │  coarse route guard     │  cookie, redirects anon
                    └────────────┬────────────┘  traffic away from /dashboard
                                 │
                    ┌────────────▼────────────┐
                    │      Next.js app        │  Node runtime
                    │  Server Components,     │
                    │  Server Actions,        │
                    │  route handlers         │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌─────────▼─────────┐
│  Supabase Auth    │  │  Supabase Postgres│  │ Supabase Storage  │
│  auth.users       │  │  public.*         │  │ eventos-public    │
│  cookie sessions  │  │  via Drizzle      │  │ signed uploads    │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

Deferred, with env vars reserved: Redis (rate limits, queue), a background job
runner, a payment provider, Sentry, PostHog.

---

## 2. Request pipeline

```
HTTP request
  │
  ├─ proxy.ts ──────────── refresh session cookie; redirect anon → /sign-in
  │
  ├─ Route handler ─────── withApi()
  │    │                     · resolve/generate x-request-id
  │    │                     · build RequestContext (+ child logger)
  │    │                     · map AppError / ZodError → §16 envelope
  │    │                     · log completion with duration
  │    │
  │    └─ requireUser() ── policies; throws UNAUTHENTICATED
  │         └─ service ─── business logic
  │              └─ repository ─── the only importer of `db`
  │
  └─ Page / Server Action
       └─ requireUserOrRedirect() ── same check, redirect instead of a 401 body
```

### Why the funnel exists

Tenant isolation is enforced in the application, not the database (no RLS). The
`RequestContext` is where the authenticated user — and from Phase 1, the tenant
and its permissions — is resolved once and carried down. Nothing below the
policy layer ever reads a tenant identifier from the request.

ESLint enforces the last hop: `@/server/db` is import-restricted everywhere
except `src/server/db/repositories/**` and the database health probe.

---

## 3. Layers

| Directory                    | Responsibility              | May import                               |
| ---------------------------- | --------------------------- | ---------------------------------------- |
| `src/app`                    | Routing, rendering          | features, components, policies, services |
| `src/features/*`             | Feature UI + Server Actions | components, services, policies, lib      |
| `src/components`             | Presentational              | lib only                                 |
| `src/server/policies`        | Authorization decisions     | context, session, errors                 |
| `src/server/services`        | Business logic              | repositories, errors, telemetry          |
| `src/server/db/repositories` | Data access                 | `db`, schema                             |
| `src/server/db/schema`       | Drizzle table definitions   | drizzle only                             |
| `src/lib`                    | Pure helpers, API contract  | nothing app-specific                     |
| `src/config`                 | Environment validation      | zod                                      |

A service importing `db`, or a component importing a repository, is a layering
violation — both are the point at which tenant scoping quietly disappears.

---

## 4. Authentication

Supabase Auth, cookie-based, via `@supabase/ssr`.

| Concern           | Decision                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Session transport | HTTP-only cookies, `SameSite=Lax` (spec §8.1)                                                                               |
| Refresh           | `proxy.ts` calls `getUser()` on every matched request                                                                       |
| Verification      | `getUser()` everywhere, never `getSession()` — the latter trusts the cookie without revalidating it against the auth server |
| CSRF              | Server Actions' built-in origin check; no REST mutation endpoints for auth                                                  |
| Identity mirror   | `public.profiles` mirrors `auth.users.id`, populated by a database trigger                                                  |

Flows: email + password, magic link, Google OAuth, password reset, email
verification. All email/OAuth returns land on `/auth/callback`, which exchanges
the PKCE code and redirects to a `safeRedirectPath()`-validated destination.

---

## 5. API contract

Every JSON endpoint returns the spec §16 envelope:

```jsonc
// success
{ "success": true, "data": {}, "meta": { "requestId": "req_…" } }

// failure
{ "success": false,
  "error": { "code": "EVENT_NOT_FOUND", "message": "…", "details": {} },
  "meta": { "requestId": "req_…" } }
```

- Codes are a published contract — additive only, never renamed.
- `x-request-id` is echoed on every response and threaded through every log line.
- Unrecognised errors become a bare `INTERNAL_ERROR`; stacks and driver messages
  never reach the client.

Auth mutations are Server Actions rather than REST endpoints: same-origin,
form-driven, and they work before JavaScript hydrates.

---

## 6. Observability

- **Logging** — `src/server/telemetry/logger.ts`. JSON lines in production,
  pretty in development. Per-request child loggers bind `requestId` and `userId`.
  Redacts `*password*`, `*token*`, `*secret*`, `*session*`, `*credential*`,
  `authorization`, `cookie`, and any key ending in `key`.
- **Health** — `/api/health` (liveness, checks nothing on purpose),
  `/api/health/database`, `/api/health/storage`, `/api/health/queue`. The queue
  probe reports `not_configured` rather than a false `ok`.
- **Deferred** — Sentry and PostHog; env vars reserved.

---

## 7. Security posture (spec §20)

| Control                           | State                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| HTTP-only cookie sessions         | ✅                                                                      |
| Password hashing                  | ✅ Supabase                                                             |
| CSRF                              | ✅ Server Action origin check                                           |
| Input validation                  | ✅ Zod, server-side                                                     |
| Open-redirect guard               | ✅ `safeRedirectPath`, unit-tested against the standard bypass set      |
| User-enumeration resistance       | ✅ generic sign-in and reset responses                                  |
| Security headers                  | ✅ HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy             |
| CSP                               | ⚠️ report-only; enforce once the report log is clean                    |
| Secret/client boundary            | ✅ enforced at build time by `@t3-oss/env-nextjs`                       |
| SQL injection                     | ✅ Drizzle parameterised queries only                                   |
| PostgREST exposure                | ✅ revoked on every table; Storage is public-read, server-write only    |
| Upload validation                 | ✅ server-side mime + 6 MB limit; server-constructed tenant-scoped keys |
| Audit logging                     | ✅ append-only `audit_logs`, written by the service layer               |
| Rate limiting                     | ❌ needs Redis. Supabase auth limits apply meanwhile                    |
| Recent-auth for sensitive actions | ❌ deferred                                                             |

---

## 8. Phase 1 — multi-tenant platform (shipped)

`RequestContext` (`src/server/context.ts`) now carries `isPlatformAdmin`, the
active `tenant`, the caller's `permissions` within it, all `memberships` (for
the switcher), and any `impersonation`. Resolved once per request in
`src/server/auth/session.ts`:

```
getRequestContext
  ├─ getCurrentUser()                     (Supabase, revalidated)
  ├─ isPlatformAdmin(user)                platform_admins
  ├─ listMembershipsForUser(user)         → switcher + default tenant
  ├─ resolveImpersonation()               live session? → overlay tenant, owner perms
  └─ resolveActiveTenant()                validated cookie → tenant + permissions
```

Two authority axes, gated in `policies/require-user.ts`: **tenant** permissions
(`requirePermission`) and **platform** admin (`requirePlatformAdmin`).
Permissions are code (`authz/permissions.ts` + `authz/roles.ts`); the database
stores only which roles a member holds.

Isolation is proven, not asserted: `tests/integration/tenant-isolation.test.ts`
runs against Postgres. Every mutating service writes to the append-only
`audit_logs`. Impersonation is a server-side, time-boxed, actor-matched overlay
with a persistent banner.

The Phase 0 promise held: nothing above the policy layer changed to add all of
this — the seam absorbed it.

## 9. Phase 2 — event management (shipped)

`events` and its satellites (`event_settings`, `event_branding`,
`event_operating_hours`) are the first tenant-scoped _domain_ tables. The
repository pattern held unchanged: every read/write derives `tenant_id` from
`ctx.tenant.id`, and a cross-tenant event id is simply not found. The event-level
permissions defined in Phase 1 (`event.create/view/update/publish/archive/delete`)
are now enforced.

- **Status machine** — a pure module (`src/server/events/status.ts`) owns the
  nine-status lifecycle and its legal transitions, so the rules are unit-tested
  without a database. The service enforces legality and stamps
  `published_at`/`archived_at`; the action gates each transition on the permission
  the target requires (`permissionForTransition`).
- **Public site** — a new `(public)/[tenantSlug]` route group serves anonymous
  visitors at `/{tenant-slug}/{event-slug}`, outside the protected prefixes so the
  proxy never redirects it. `findPublicEvent` is the single guard that keeps
  drafts off the web: it returns a row only for a `published`/`live`/`ended`,
  non-`private`, non-deleted event under an active tenant. Everything else is a
  `404`. The date-derived phase (Upcoming/Live/Ended) is computed in SQL, so no
  `Date.now()` runs during render.
- **Isolation proven again** — `tests/integration/event-isolation.test.ts` shows a
  member of one tenant cannot read or update another's event, slugs are
  per-tenant, and drafts stay private.

## 10. Phase 3 — merchant onboarding (shipped)

Merchants add a **third authority axis** alongside tenant membership and platform
admin. A `merchant_members` row links a user to a merchant; `requireMerchantMember`
(`policies/require-merchant.ts`) resolves it and returns a `MerchantScopedContext`
whose `merchant.id` is derived from membership — never from the request. Merchant
data is therefore reachable two ways, each scoped in the repository layer:

```
organizer  → requirePermission("merchant.*")  → scoped by ctx.tenant.id
merchant   → requireMerchantMember(merchantId) → scoped by ctx.merchant.id
```

- **Approval workflow** — a pure module (`server/merchants/status.ts`) owns the
  participation lifecycle (draft → submitted → approved / changes-requested /
  rejected / withdrawn), which transitions are legal, and _who_ may make each
  (merchant vs organizer). The organizer's verdicts gate on
  `merchant.approve`/`merchant.reject`; the merchant submits and withdraws.
- **The merchant portal** lives at `/merchant` — authenticated but not
  tenant-scoped, so a merchant member who is not an organizer has a home. The
  earlier no-workspace dead-end is gone: `/dashboard` now routes a user to
  wherever they actually belong (platform console, merchant portal, or the
  no-workspace screen only if genuinely unaffiliated).
- **Public** — the event page lists approved merchants and links to a public
  merchant detail page (`/[tenantSlug]/[eventSlug]/[merchantSlug]`) with the menu.
  The same "filter by public status, never a membership check" seam from Phase 2
  applies: a listing is public only when `approved` under a public event with an
  active merchant.
- **Isolation proven again** — `tests/integration/merchant-isolation.test.ts`
  covers both axes: cross-tenant invisibility, membership-scoped access, item
  scoping by participation, and public-shows-approved-only.

## 11. Phase 4 — booths, maps & the media pass (shipped)

The floor plan arrives as event-scoped tables — `zones`, `maps`, `map_floors`,
`booths` — and `booth_assignments` links a `merchant_event_participation` to a
booth. Two pure modules pin the rules: `server/booths/status.ts` owns the booth
lifecycle (`available → reserved → assigned → confirmed`, plus manual
`blocked`/`cancelled`) and the assignment lifecycle (`assigned → confirmed`, or
→ `cancelled`), keeping the booth's status in step. The organizer assigns and
cancels (`booth.manage`, tenant-scoped); the merchant confirms their own booth
(membership-scoped) — the §7 loop.

- **The media pass.** The long-reserved `*_file_id` columns finally light up on a
  real Supabase Storage flow. `files` is a normal tenant-scoped table written only
  through the repository layer; objects are written by `server/media/storage.ts`
  — the _one_ sanctioned service-role use in a request path, justified because
  Storage isn't our `public.*` schema and the object key is server-constructed
  from `ctx.tenant.id` + entity ids (see §7 and CLAUDE.md §6). `media.service` +
  `entity-media.service` are the seam; a reusable `<ImageUploadField>` +
  `<MediaImage>` render everywhere (map floors, merchant logo/cover, item photos,
  event branding).
- **The public interactive map** (`/[tenantSlug]/[eventSlug]/map`) is a client
  component: an image-based floor plan with normalized booth coordinates, pan +
  wheel/pinch zoom, search, zone legend, and deep-linking (`?booth=`). It reuses
  the Phase 2/3 seam — `listBoothsForEventPublic` links a booth to a merchant only
  when the assignment is active, the listing is `approved`, and the merchant is
  active; every other booth renders as an unlinked shape.
- **Isolation proven again** — `tests/integration/booth-isolation.test.ts` covers
  cross-tenant invisibility of booths/zones, tenant-scoped assignment lookups, and
  public-shows-approved-only.

## 12. Phase 5 — visitor experience (shipped)

The public event site becomes something a visitor can explore on a phone:
a searchable, filterable merchant directory, one-tap favourites, recently-viewed,
and an installable PWA — all anonymous, all mobile-first at 390px.

- **Anonymous, cookie-backed identity.** A `visitors` row is minted lazily on the
  first favourite/view and pinned by the `eventos_vid` httpOnly cookie
  (`server/services/visitor.service.ts`). The write path
  (`resolveVisitorForAction`) sets the cookie — only possible in a Server Action —
  while Server Components read it read-only (`getVisitorForRead`). `visitors` is
  **not** tenant-scoped; favourites/recent-views are, but are keyed by visitor +
  event, with `tenant_id`/`event_id` always resolved from the URL slugs via
  `findPublicEvent`, never a client value — the §6 public seam extended to the
  visitor's own writes.
- **The directory** (`/[tenantSlug]/[eventSlug]/merchants`) runs one parameterized
  Postgres full-text query (`directory.repository.ts`): a CTE of item facts, a
  `to_tsvector`/`websearch_to_tsquery` ranked document, and the MVP filter set
  (category, zone, halal, promo, price). The URL is the state — search + filter
  chips are shareable and reload-safe (`features/visitors/filters.ts` parses the
  params; unit-covered). Cards, favourites, and recent-views all render through one
  `MerchantCard`.
- **Favourites & recent-views** (`/favourites`, plus the event home strip) read
  only still-public listings, so an unapproved merchant silently drops from a
  visitor's saved list. The favourite heart is optimistic and re-checks the
  `enable_favourites` setting server-side.
- **PWA** (spec §8.10): a per-event `manifest.webmanifest` route (name/scope/theme
  from the event; a draft's manifest 404s like its page), a network-first service
  worker with an `/offline` fallback (HTML never cached — it's per-visitor), an
  install banner, and dependency-free generated icons. Registration lives in the
  public layout so it covers every event.
- **Isolation proven again** — `tests/integration/visitor-directory.test.ts` covers
  favourite/recent isolation by visitor and event, the public-shows-approved-only
  seam across the directory, and every filter; `directory-filters.test.ts` unit-
  covers the param parser; `tests/e2e/visitors.spec.ts` walks search → filter →
  favourite → the favourites page.

## 13. Phase 6 — monetization (shipped)

Plans, enforced usage limits, a simulated upgrade flow, and featured listings.

- **Plans live in code** (`server/billing/plans.ts`) — the metric list, per-tier
  limits, and entitlements are a typed source of truth (like permissions), and the
  seed mirrors them into the `plans` catalog the `/platform/plans` page renders.
  A subscription is one row per tenant; billing is **simulated** (`changePlan`
  records subscription + a paid invoice + a `billing.plan_changed` audit — no
  Stripe; `external_ref` reserves the id).
- **Usage metering covers every §22 metric** (`usage.service`). The four "live"
  metrics (events, merchants-per-event, team, storage) are counted from their
  source tables; the event-driven ones are summed from the append-only
  `usage_records` ledger that later phases write via `recordUsage`. `computeUsage`
  drives the billing dashboard's usage bars (80% warn, over-limit red).
- **Enforcement is at the create paths.** `assertWithinLimit` throws
  `PLAN_LIMIT_REACHED` (402) on the hard metrics — wired into `createEvent`,
  `addParticipation`, `inviteMember`, and `uploadImage` (storage bytes);
  `requirePlanFeature` throws `PLAN_FEATURE_REQUIRED` for gated features. Both take
  a `tenantId` (not `ctx`) so the storage check works from the media path. Not
  exempt during impersonation — the acting tenant's plan governs.
- **Featured listings** (`featured.service`, gated by `merchant.feature` +
  `featured_listings`) write a `featured_placements` row (one open per
  participation, partial unique index), set the participation's `featured_rank`,
  and audit. The public directory + event home surface a "★ Featured" badge and
  the Phase 5 directory boost — no query change needed.
- **Isolation & math proven** — `tests/integration/billing.test.ts` covers plan
  resolution, hard-limit enforcement, feature gating, usage computation, and the
  one-open-placement constraint, all tenant-isolated; `billing-plans.test.ts`
  unit-covers the limit math; `tests/e2e/billing.spec.ts` walks the simulated
  upgrade and the public featured badge.
