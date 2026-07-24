# CLAUDE.md — Working rules for EventOS

Read `EventOS_PROJECT.md` for the product specification. This file is the
engineering contract: the rules that are expensive to rediscover and dangerous
to violate.

Current state: **Phase 0 complete.** Next: Phase 1 (multi-tenant platform).

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

3. **Every tenant-scoped query filters on `tenant_id`.** From Phase 1, every
   repository function takes an `AuthenticatedContext` and derives the predicate
   from it. A query without that predicate is a data breach, not a bug.

4. **The Supabase anon client is for auth only.** Never read application data
   with it. With RLS off, PostgREST access to our tables is revoked at the
   database level (see `drizzle/0001_auth_triggers.sql`) — keep it that way for
   every table you add.

5. **The service role client bypasses everything.** It belongs in the seed script
   and, later, explicit platform-admin operations. Never in a code path that
   serves organizer, merchant, or visitor traffic.

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

- The `proxy.ts` route guard is a **UX redirect**, not a security boundary.
- The real check is `requireUser()` / `requireUserOrRedirect()` server-side, and
  from Phase 1 `requirePermission()`.
- Never rely on hiding a button (spec §14).
- Sensitive actions (billing, API keys, domains, exports, impersonation) require
  recent authentication (spec §20). Not yet implemented — Phase 1.

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
- Every table added from Phase 1 on carries `tenant_id`, `created_at`,
  `updated_at`, and the `set_updated_at` trigger.

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

**Known gap:** application-level rate limiting is not implemented (needs Redis,
Phase 1). Supabase's built-in auth limits apply in the meantime.

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
