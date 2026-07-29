# CLAUDE.md — Working rules for EventOS

Read `EventOS_PROJECT.md` for the product specification. This file is the
engineering contract: the rules that are expensive to rediscover and dangerous
to violate.

Current state: **Phase 10 complete** — the §34 build phases (0–8) are all done, plus two
post-spec phases: **9, sponsor ad space** (bookings, flights, weighted rotation, viewable
impressions, click redirect, reporting) and **10, Moments** (visitor accounts + a
post feed with organiser moderation).

---

## 1. The isolation contract

EventOS is multi-tenant. Every organizer's data must be invisible to every other
organizer. We enforce that in the **application**, not the database — there is no
Row Level Security.

That choice puts the whole burden on these rules. They are not style preferences.

1. **`tenant_id` never comes from the client.** Not from a request body, a query
   string, a path parameter, a header, or a cookie. It is derived from the
   authenticated user's membership and carried on `RequestContext`.
   (`src/server/context.ts`)

2. **Only the repository layer imports `db`.** Services, route handlers, Server
   Actions, and components go through `src/server/db/repositories/*`. ESLint
   enforces this — if you find yourself adding an exception, you are about to
   bypass tenant scoping.

3. **Every tenant-scoped query filters on `tenant_id`.** Tenant-scoped repository
   functions take a `tenantId` the caller derived from `ctx.tenant.id` (via
   `requireTenant`/`requirePermission`), never a client value. User-scoped
   queries that _produce_ a tenant id (`listMembershipsForUser`,
   `findMembershipWithRoles`) key on the authenticated user. A tenant-scoped
   query without the predicate is a data breach, not a bug — the integration
   test in `tests/integration/tenant-isolation.test.ts` guards this.

4. **The Supabase anon client is for auth only.** Never read application data
   with it. With RLS off, PostgREST access to our tables is revoked at the
   database level (see `drizzle/0001_auth_triggers.sql`) — keep it that way for
   every table you add.

5. **The service role client bypasses everything.** It belongs in the seed script
   and, later, explicit platform-admin operations. Never in a code path that
   serves organizer, merchant, or visitor traffic.

6. **Public reads are the one exception, and they filter, they don't scope.**
   Visitor-facing pages under `app/(public)/[tenantSlug]` serve anonymous traffic,
   so they can't derive a tenant from membership. They resolve the tenant from the
   URL slug and return rows only when the content is _publicly_ visible —
   `findPublicEvent` returns null for any non-`published`/`live`/`ended`,
   `private`, or soft-deleted event. A draft must be indistinguishable from "not
   found". Any future public surface (merchant pages in Phase 3, …) follows this
   same filter-by-public-status shape — never a membership check, never a client
   `tenant_id`.

If Phase 1 or later adds RLS as defence in depth, these rules still stand — RLS
would be the second lock, not a replacement for the first.

---

## 2. Layering

```
app/ · features/          UI and route entry points
  └─ features/*/actions   Server Actions — validate input, call services
       └─ server/policies requireUser / requireTenant / requirePermission
            └─ server/services      business logic
                 └─ server/db/repositories   the only importers of `db`
```

- Business logic never lives in a component (spec §10.2).
- A service never imports `db`.
- A repository never contains business rules.
- `withApi()` wraps every route handler so the §16 envelope, request IDs, and
  error mapping are automatic. Do not hand-roll a `NextResponse.json` shape.

---

## 3. Authorization

Three independent axes:

1. **Tenant authority** — `ctx.permissions` (a `Set<Permission>`) within the
   active tenant. Gate with `requirePermission("tenant.manage_members")` in
   actions/routes, `requirePermissionOrRedirect(...)` in pages.
   (`src/server/policies/require-user.ts`)
2. **Platform authority** — `ctx.isPlatformAdmin` (boolean, from the
   `platform_admins` table). Gate with `requirePlatformAdmin()` /
   `requirePlatformAdminOrRedirect(...)`. It is NOT a permission and NOT a tenant
   role.
3. **Merchant authority** (Phase 3) — `merchant_members` links a user to a
   merchant. Gate with `requireMerchantMember(merchantId)` /
   `...OrRedirect(...)` (`src/server/policies/require-merchant.ts`), which derives
   `ctx.merchant.id` from membership. Merchants have no sub-roles: managing the
   merchant is the whole grant. Approving a merchant's listing is the organizer's
   authority (`merchant.approve`/`merchant.reject`), never the merchant's.

Rules:

- Permissions are **code, not data**: the union lives in
  `src/server/authz/permissions.ts`, the role→permission map in `roles.ts`. The
  DB stores which roles a member has (`tenant_member_roles`), not what they mean.
  The `permissions`/`role_permissions` tables from the schema sketch are
  intentionally not created.
- The `proxy.ts` route guard is a **UX redirect**, not a security boundary.
- Never rely on hiding a button (spec §14) — every page that hides a nav item
  re-checks with a policy, and the Server Action it submits to re-checks again.
- **Impersonation** (`src/server/services/impersonation.service.ts`): platform
  admin only, server-side session, time-boxed (30 min), actor-matched on every
  request, and always visibly bannered. `ctx.user` stays the admin, so audit
  records the real actor with `via_impersonation`.
- Still deferred to a later phase: recent-auth (re-auth) for the most sensitive
  actions, and application rate limiting (needs Redis).

---

## 4. Database

- Drizzle owns **`public` only**. Supabase owns `auth`, `storage`, `realtime`.
  `schemaFilter: ["public"]` in `drizzle.config.ts` enforces this; do not relax it.
- Schema changes: edit `src/server/db/schema/*`, run `pnpm db:generate`, **read
  the generated SQL**, commit it. Never `db:push` against a shared database.
- Things Drizzle cannot express (cross-schema FKs, triggers, expression indexes,
  grants) go in a hand-written migration and are **deliberately absent** from the
  schema files — see the comment block in `schema/profiles.ts` for why.
- Migrations run against `DIRECT_DATABASE_URL` (port 5432). The app runs against
  `DATABASE_URL` (pooler, 6543, `prepare: false`).
- Every tenant-scoped table carries `tenant_id`, `created_at`, `updated_at`, and
  the `set_updated_at` trigger — and **every new table repeats the
  `REVOKE ALL … FROM anon, authenticated`** in its migration (that revoke is what
  makes "no RLS" safe, not just intentional).
- `audit_logs` is append-only, enforced by a DB trigger. Write to it only through
  `recordAudit(ctx, …)`; every state-changing service action must audit (spec §23).

---

## 5. Errors and the API contract

- Throw `AppError` with a code from `src/lib/api/error-codes.ts`. Never throw a
  bare string or leak a driver message.
- **Error codes are a public contract.** Add freely; never rename or repurpose.
- Anything not an `AppError` becomes a generic `INTERNAL_ERROR` — stack traces
  and SQL never reach the client.
- Cross-tenant access is `403 TENANT_MISMATCH`, never a 404.

---

## 6. Security defaults

- All input validated with Zod, server-side. Client validation is UX only.
- Any user-influenced redirect target goes through `safeRedirectPath()`.
- Auth failures return generic messages — never reveal whether an account exists.
- Secrets: server-only env vars, never `NEXT_PUBLIC_*`. `src/config/env.ts`
  enforces the boundary at build time.
- The logger redacts anything named `*password*`, `*token*`, `*secret*`,
  `*session*`, `*credential*`, `authorization`, `cookie`, or `*key`. Add to that
  list before logging a new sensitive field, not after.
- **Media uploads are the one sanctioned service-role use in request paths.**
  Writing an object to the `eventos-public` bucket needs the service-role Storage
  API (the anon key can't without Storage RLS, which we don't run). This is _not_
  a §1 rule-5 violation: Storage is Supabase-owned, not our `public.*` schema, and
  the object path is **server-constructed** from `ctx.tenant.id` + entity ids, so
  scoping is never client-controlled. Keep every such use behind
  `src/server/media/storage.ts` (`getUploadBucket`), which never touches a
  `public.*` table — the `files` row is always written through the repository
  layer with a scoped `tenant_id`. Never widen this to read/write our tables.

**Plan limits (Phase 6):** the tenant's plan caps usage (§22). `assertWithinLimit`
(and `requirePlanFeature`) in `src/server/services/usage.service.ts` gate the
hard metrics — active events, merchants per event, team members, storage — at
their create paths and throw `PLAN_LIMIT_REACHED` / `PLAN_FEATURE_REQUIRED` (402).
Plan definitions (limits + entitlements) are **code** (`src/server/billing/plans.ts`),
mirrored into the seeded `plans` catalog. Billing is **simulated** (no Stripe):
`changePlan` records a subscription + a paid invoice + an audit line. This is
distinct from application rate limiting.

**Analytics (Phase 7):** the raw log `analytics_events` is **append-only** (like
`usage_records` / `qr_scan_events` — no `updated_at`/trigger) and, like every
other table, is written **only through the repository layer**. Its `tenant_id` +
`event_id` are always **server-derived** — from the public URL slug
(`recordTrackedEvent` → `findPublicEvent`), from a resolved server seam
(`setFavourite`), or from a QR code's **own row** (`/q` → `resolveScan`) — never a
client value (the §1/§6 public-write seam). The public browser beacon
(`trackEvent` action → `<Track>`) may emit **only** the `CLIENT_TRACKABLE` subset
of the §25 taxonomy (`src/server/analytics/taxonomy.ts`); favourite + QR events
originate server-side, so the beacon can't forge them. The anonymous-visitor
cookie identity is shared with Phase 5 via `visitor-identity.service.ts`
(`getOrSetAnonymousId` mints the cookie **without** a `visitors` DB row — browsing
still writes nothing). Dashboards read **live from the raw log** (so numbers match
it by construction); `daily_event_metrics`/`daily_merchant_metrics` are a derived
rollup rebuilt idempotently by `runDailyAggregation` behind the
`CRON_SECRET`-guarded `/api/cron/aggregate-metrics`. QR generation is an audited
organizer mutation
(`qr.code_created`); the high-volume tracking writes are **not** audited (§23 is
for actor state-changes, not visitor telemetry). Only an approximate `country`
(from `x-vercel-ip-country`) is ever stored — never precise geo (§8.10).

**Vouchers & campaigns (Phase 8):** claiming is **transactional** —
`claimVoucherTx` locks the voucher row (`SELECT … FOR UPDATE`) *before* reading
the quantity and per-visitor counts, so a limited voucher can never be
over-issued by concurrent claims. Never "optimize" that lock away. Redemption's
real guarantee is `unique(voucher_code_id)` on `voucher_redemptions`: the service
pre-checks for a friendly error, but the constraint is what stops a double spend
under a race — keep both. A voucher claim is one of the few public paths that
creates a `visitors` row (`resolveVisitorForClaim`); browsing still writes
nothing. The public voucher surface is gated by the event's `enable_vouchers`
setting and, like a draft event, a disabled one **404s** rather than explaining
itself. Vouchers/campaigns are plan entitlements (`requirePlanFeature`), and this
phase is where the §22 ledger metrics (`voucher_claims`, `voucher_redemptions`,
`email_sends`/`push_sends`) finally get written.

**Campaign delivery is simulated.** `server/notifications/provider.ts` is the
seam: deliveries are recorded per recipient and marked sent, but nothing is
transmitted. Supabase's built-in email was evaluated and **rejected** — it is
auth-transactional only (confirm/magic-link/reset/invite), hard rate-limited, and
the only way to send arbitrary mail through it is to abuse
`inviteUserByEmail`/`generateLink`, which creates accounts and mails auth links.
Do not build campaigns on it. Real sending is one adapter implementing
`NotificationProvider` plus a key (`EMAIL_PROVIDER`/`RESEND_API_KEY` are already
reserved). Any UI showing send counts must keep saying they're simulated until
an adapter lands.

**Status scheduler (background jobs).** The date-driven job runner is implemented
(`server/services/scheduler.service.ts`, `docs/background-jobs.md`): a
`CRON_SECRET`-guarded `/api/cron/run-scheduler` advances event
(`published→live→ended`) and voucher (`scheduled→active→expired`) statuses across
all tenants. It is the platform's only sanctioned **system-wide, cross-tenant**
write — legitimate because the clock is the only input and each row's `tenant_id`
is read from the row, never a client (`scheduler.repository.ts` documents this).
The sweeps are idempotent (`WHERE` re-filters on the source status) and each
transition is **system-audited with a null actor** (`recordSystemAudits`; the
trail's `actor_user_id` is nullable). The transition rules live once as pure,
unit-tested functions (`dueEventStatus`/`dueVoucherStatus`) that the SQL mirrors —
the same `pure ↔ SQL` split as `eventPhase ↔ phaseExpr`. Both crons share
`requireCronAuth` (`src/lib/api/cron-auth.ts`). Scheduling in `vercel.json` is
inert until a `CRON_SECRET` is set + deployed; the endpoint is equally callable by
any external scheduler holding the token. A durable job/queue table is still not
warranted — add one only when a job needs retries or fan-out a cron sweep can't
express.

**Moments & visitor accounts (Phase 10):** there is exactly **one identity pool**,
`auth.users` — a "visitor account" is just an account with no tenant membership,
so visitor sign-in reuses the existing audited auth actions with `?next=` back
into the event. Never build a second auth path. The link is
`visitors.user_id`, written only by `resolveSignedInVisitor()`
(`visitor-account.service.ts`), which resolves **by `user_id` first** — the
account is the identity, so a second device with a different cookie must not fork
it (`visitors_user_id_uq`, a partial unique index, makes that a DB guarantee).
Anonymous browsing still writes nothing; posting is now a third path (with
favourite + voucher claim) that materialises a `visitors` row.

Posting is public-write and follows the §1 rule-6 seam: tenant + event come from
`findPublicEvent`, the author from the session, and `moment_posts.tenant_id` from
the resolved event — never the form. Moments are **post-moderated**: posts go
live immediately, `moment.moderate` hides them, and hide/restore are audited
(`moment.hidden` / `moment.restored`) with who/when/why on the row. An author's
own `deleted` is theirs — an organiser cannot restore it. A disabled feed
(`enable_moments` off) **404s**, like a draft event. Three CHECK constraints carry
the content rules — rating 1–5, a rating requires a tagged stall, and a post needs
a non-blank body **or** an image — because the service's validation can be bypassed
by a future code path and a constraint cannot. (`btrim()` trims spaces only; the
"non-blank" check uses `~ '[^[:space:]]'` after 0021 shipped with that hole.)
Visitor photos count against the organizer's storage limit and are uploaded
before the insert, since a photo-only post has no other content.

**Known gap:** application-level rate limiting is not implemented (needs Redis).
Supabase's built-in auth limits apply in the meantime. That gap matters more now
that Moments accepts visitor-generated content.

---

## 7. Working process (spec §33.2)

1. One module at a time. Never build the whole platform in one pass.
2. Plan before coding. Write it down in `docs/`.
3. Do not silently change the schema.
4. Update docs when architecture changes.
5. Add tests for every piece of critical business logic — pricing, plan limits,
   RBAC, status transitions, tenant isolation.
6. Feature-flag incomplete modules.
7. Keep the app deployable after every phase.
8. Do not add a dependency without a stated reason.
9. Add loading, empty, error, and success states to every view.

---

## 8. Commands

```bash
pnpm dev              # dev server
pnpm verify           # typecheck + lint + unit tests — run before every commit
pnpm test             # unit tests
pnpm test:e2e         # Playwright (needs a running app)
pnpm db:generate      # generate a migration from schema changes
pnpm db:migrate       # apply migrations
pnpm db:seed          # dev fixtures (refuses to run in production)
pnpm format           # Prettier
```

---

## 9. Conventions

- TypeScript strict. No `any` without a comment explaining why.
- Server Components by default; `"use client"` only where interactivity needs it.
- A `"use server"` file may export **only async functions** — shared constants
  and types go in a sibling module (see `features/auth/form-state.ts`).
- shadcn/ui here is built on Base UI: use `render` or `buttonVariants()`, not
  `asChild`.
- Mobile-first. Every visitor-facing view is designed at 390px first.
- Internally generic naming, per spec §8.5: `ListingItem`, not `Product` — the
  same entity is a menu item at a food festival and a package at a property expo.
