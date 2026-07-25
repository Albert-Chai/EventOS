# CLAUDE.md — Working rules for EventOS

Read `EventOS_PROJECT.md` for the product specification. This file is the
engineering contract: the rules that are expensive to rediscover and dangerous
to violate.

Current state: **Phase 4 complete** (booths, maps & the media pass). Next: Phase 5 (visitor experience).

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

**Known gap:** application-level rate limiting is not implemented (needs Redis).
Supabase's built-in auth limits apply in the meantime.

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
