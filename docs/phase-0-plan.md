# Phase 0 — Foundation: Implementation Plan

Status: **complete** — see §13 for what was verified and §14 for deviations
Spec reference: `EventOS_PROJECT.md` §34 (Phase 0), §33 (working instructions)

---

## 1. Scope Summary

Stand up a deployable, tested, multi-tenant-_ready_ Next.js application skeleton with
working authentication. No tenant, event, or merchant domain logic — Phase 0 builds the
foundation those phases sit on, and establishes the seams (request context, policy layer,
repository layer, API envelope) that Phase 1 extends.

**In scope**

- Repository, tooling, and CI
- Next.js + TypeScript strict + Tailwind + shadcn/ui
- Supabase Postgres + Drizzle ORM + migrations
- Supabase Auth (email/password, magic link, Google, reset, verification)
- Environment variable validation
- API response standard, structured error codes, request correlation IDs
- Structured logging
- Health endpoints
- Unit + e2e test harness
- Landing page and a guarded placeholder dashboard route
- Seed script

**Explicitly out of scope for Phase 0** (later phases)

- Tenants, memberships, RBAC, audit logs → Phase 1
- Events, merchants, booths, maps, vouchers → Phases 2–8
- Background job runner → wired as an interface only; no worker until Phase 3 (CSV import)
- Payments → Phase 6
- Sentry / PostHog SDKs → env vars reserved, SDKs installed at first deploy

---

## 2. Final Technology Choices

| Concern                | Choice                                  | Rationale                                                                                                                                                         |
| ---------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework              | Next.js 16 (App Router)                 | Spec §10.1 says "15+"; 16 is current. Node 20.20 satisfies its `^20.9` engine requirement.                                                                        |
| Language               | TypeScript, `strict: true`              | Spec §36 rule 13                                                                                                                                                  |
| Styling                | Tailwind CSS v4 + shadcn/ui             | Spec §10.1                                                                                                                                                        |
| Database               | Supabase Postgres                       | Chosen: fewest vendors for MVP; Singapore region for Malaysia-first latency                                                                                       |
| ORM                    | Drizzle ORM + drizzle-kit               | Spec §10.2 "Preferred". SQL-first migrations we can hand-edit for triggers                                                                                        |
| DB driver              | `postgres` (postgres.js)                | Works with Supabase pooler and direct connection                                                                                                                  |
| Auth                   | Supabase Auth via `@supabase/ssr`       | Chosen. HTTP-only cookie sessions (§8.1)                                                                                                                          |
| Storage                | Supabase Storage (S3-compatible)        | Spec §10.3; same vendor, signed upload URLs                                                                                                                       |
| Validation             | Zod v4                                  | Spec §36 rule 14                                                                                                                                                  |
| Env validation         | `@t3-oss/env-nextjs`                    | Enforces the server/client boundary at build time so server secrets cannot leak into the client bundle — a security property, not sugar (justifies §33.2 rule 16) |
| Forms                  | React Hook Form + `@hookform/resolvers` | Spec §10.1                                                                                                                                                        |
| Server state           | TanStack Query                          | Spec §10.1. TanStack Table deferred to Phase 1 (no tables yet — rule 16)                                                                                          |
| Logging                | Hand-rolled JSON logger (~70 lines)     | Runtime-agnostic (Node + Edge middleware). `pino` does not run in the Edge runtime; a dependency we would have to work around is not justified                    |
| Unit/integration tests | Vitest                                  | Fast, native ESM/TS                                                                                                                                               |
| E2E                    | Playwright                              | Spec §29                                                                                                                                                          |
| Lint/format            | ESLint (next config) + Prettier         | —                                                                                                                                                                 |
| CI                     | GitHub Actions                          | Spec §31                                                                                                                                                          |
| Package manager        | pnpm 9                                  | Already installed                                                                                                                                                 |
| Hosting                | Vercel                                  | Spec §31                                                                                                                                                          |

**Deferred with reserved env vars:** payments, Sentry, PostHog, Redis, queue.
Health endpoint reports these as `not_configured` rather than faking readiness.

---

## 3. Assumptions

1. The repo lives at `/Users/albert/Desktop/EventOs`, initialised as a fresh git repo.
   `EventOS_PROJECT.md` stays at the root as the canonical spec.
2. Public URL strategy is `app.eventos.my/{tenantSlug}/{eventSlug}` (§17). Custom-domain
   routing is Phase 6+; Phase 0 does not add domain middleware.
3. Supabase owns the `auth` schema. Drizzle owns **only** the `public` schema and must
   never generate migrations against `auth`.
4. Row Level Security is **not** used (per the isolation decision). Isolation is enforced
   in a centralized application repository layer. Consequently:
   - the app connects with a role that bypasses RLS, and
   - the Supabase **anon** client is used for auth flows only, never for data reads.
     This is written into `CLAUDE.md` as a hard rule because it is the single assumption
     most likely to be violated later.
5. Seed data (§38) targets local/dev only and refuses to run when `NODE_ENV=production`.
6. Emails in Phase 0 are sent by Supabase Auth's built-in mailer. Resend is introduced in
   Phase 3 when transactional merchant invitations arrive.

---

## 4. Open Questions (non-blocking — proceeding with the stated default)

| #   | Question                                  | Default taken                                                                                                                             |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Supabase project region                   | Singapore (`ap-southeast-1`) — closest to Malaysia                                                                                        |
| 2   | Do you want Google OAuth live in Phase 0? | Code path built and tested; the button self-disables unless `AUTH_GOOGLE_ID` is set, so no broken UI before you register the OAuth client |
| 3   | Repo remote                               | Local git only. Say the word and I'll `gh repo create`                                                                                    |

---

## 5. Technical Approach

### 5.1 Request context — the tenant-isolation seam

Everything that touches data goes through one funnel. Phase 0 builds the funnel with only
the `user` field populated; Phase 1 adds `tenant` and `permissions` without changing any
call site.

```
Route handler / Server Action
  └─ withApi()                  request id, logging, error → API envelope
       └─ requireUser(ctx)      policies/ — throws AppError(UNAUTHENTICATED)
            └─ service          business logic; never imports `db` directly
                 └─ repository  the ONLY layer that imports `db`
```

`RequestContext` (`src/server/context.ts`):

```ts
type RequestContext = {
  requestId: string;
  user: AuthenticatedUser | null;
  // Phase 1: tenant: TenantContext | null
  // Phase 1: permissions: ReadonlySet<Permission>
};
```

The rule enforced from day one: **`tenant_id` is never read from the request body, query
string, or a header.** It is derived from the authenticated user's membership. Phase 0 has
no tenants, so the rule is documented and lint-guarded rather than exercised.

### 5.2 API envelope (§16)

`withApi()` wraps every route handler:

- reads or generates `x-request-id`, echoes it on the response and into every log line
- success → `{ success: true, data, meta: { requestId } }`
- `AppError` → its status + `{ success: false, error: { code, message, details }, meta }`
- unknown throw → logged with stack, returned as `INTERNAL_ERROR` with **no** internals leaked

Error codes live in one union (`src/lib/api/error-codes.ts`) so the client can switch on
them. Phase 0 ships the generic ones plus `EVENT_NOT_FOUND` from the spec example.

### 5.3 Database

Phase 0 schema is deliberately one table:

```
profiles
  id            uuid  PK, references auth.users(id) on delete cascade
  email         text  not null
  display_name  text
  locale        text  not null default 'en'
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
```

Plus two hand-written SQL migrations Drizzle cannot express:

1. `handle_new_user()` trigger on `auth.users` → inserts the `profiles` row
2. `set_updated_at()` trigger applied to `profiles` (reused by every later table)

Migrations are generated with `drizzle-kit generate`, reviewed, and committed. Never
`db:push` against anything but a local scratch database (§33.2 rule 6).

### 5.4 Auth flows

| Flow                         | Route              | Notes                                                                                                        |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Sign up (email + password)   | `/sign-up`         | Server Action → Supabase; confirmation email                                                                 |
| Sign in                      | `/sign-in`         | Server Action; generic error message on failure (no user enumeration)                                        |
| Magic link                   | `/sign-in`         | Same page, second tab                                                                                        |
| Google OAuth                 | `/sign-in`         | Renders only when configured                                                                                 |
| Email confirm / OAuth return | `/auth/callback`   | PKCE code exchange, then redirect to `next` (validated as a same-origin relative path — open-redirect guard) |
| Forgot password              | `/forgot-password` | Always reports success, regardless of whether the address exists                                             |
| Reset password               | `/reset-password`  | Requires the recovery session                                                                                |
| Sign out                     | Server Action      | Clears cookies, redirects to `/`                                                                             |

`middleware.ts` refreshes the Supabase session cookie on every request and guards
`/dashboard/*`. The middleware guard is a UX redirect; the authoritative check is
`requireUser()` server-side (§14: "Never rely only on hiding buttons in the frontend").

### 5.5 Logging

`src/server/telemetry/logger.ts` — a JSON-line logger with levels, a `child()` for
per-request binding, and a redaction list (`password`, `token`, `authorization`,
`cookie`, `secret`, `key`). Pretty-prints in development, one JSON line per entry in
production for log-aggregator ingestion.

---

## 6. Files to Create

```
.github/workflows/ci.yml
.env.example
.gitignore
CLAUDE.md
README.md
docs/phase-0-plan.md          ← this file
docs/architecture.md
docs/database.md
drizzle.config.ts
next.config.ts
package.json
playwright.config.ts
tsconfig.json
vitest.config.ts

drizzle/
  0000_init.sql               generated
  0001_auth_triggers.sql      hand-written

scripts/
  seed.ts

src/
  middleware.ts
  app/
    layout.tsx  page.tsx  globals.css  error.tsx  not-found.tsx
    (auth)/sign-in|sign-up|forgot-password|reset-password/page.tsx
    (auth)/layout.tsx
    auth/callback/route.ts
    (dashboard)/layout.tsx  (dashboard)/dashboard/page.tsx
    api/health/route.ts
    api/health/database/route.ts
    api/health/storage/route.ts
    api/health/queue/route.ts
  components/ui/…             shadcn primitives
  components/forms/…          field wrappers wired to RHF + Zod
  features/auth/
    actions.ts  schemas.ts  components/…
  server/
    context.ts
    auth/supabase.ts  auth/session.ts
    db/index.ts  db/schema/index.ts  db/schema/profiles.ts
    db/repositories/profiles.repository.ts
    policies/require-user.ts
    services/profile.service.ts
    telemetry/logger.ts
    integrations/storage.ts
  lib/
    api/handler.ts  api/response.ts  api/errors.ts  api/error-codes.ts
    supabase/client.ts
    utils.ts
  config/env.ts
  types/…

tests/
  unit/env.test.ts  unit/api-response.test.ts  unit/errors.test.ts
  unit/redirect-guard.test.ts
  e2e/auth.spec.ts  e2e/landing.spec.ts
```

## 7. Database Changes

- New table: `profiles`
- New functions: `public.handle_new_user()`, `public.set_updated_at()`
- New triggers: `on_auth_user_created` (on `auth.users`), `profiles_set_updated_at`
- Migrations committed under `drizzle/`

## 8. API Changes

| Method | Path                   | Auth   | Purpose                                   |
| ------ | ---------------------- | ------ | ----------------------------------------- |
| GET    | `/api/health`          | public | Liveness; always 200 if the process is up |
| GET    | `/api/health/database` | public | `select 1` round-trip + latency           |
| GET    | `/api/health/storage`  | public | Storage bucket reachability               |
| GET    | `/api/health/queue`    | public | Reports `not_configured` in Phase 0       |
| GET    | `/auth/callback`       | public | PKCE code exchange                        |

Auth mutations are Server Actions, not REST endpoints — they are same-origin, form-driven,
and get CSRF protection from Next's Server Action origin check.

## 9. UI Changes

- Landing page: positioning line from §40, feature summary, CTAs to sign up / sign in
- Auth pages: mobile-first, shadcn `Card` + `Form`, inline validation, pending states
- Dashboard placeholder: greets the signed-in user, sign-out button, "Phase 1" notice
- Global: `error.tsx`, `not-found.tsx`, loading skeletons, dark mode

## 10. Security Checks (§20)

| Control                   | Phase 0 status                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP-only cookie sessions | Supabase SSR cookie adapter                                                                                                              |
| Password hashing          | Supabase (bcrypt)                                                                                                                        |
| CSRF                      | Server Action origin validation + `SameSite=Lax` cookies                                                                                 |
| Input validation          | Zod on every action and route                                                                                                            |
| Open-redirect guard       | `next` param must be a same-origin relative path                                                                                         |
| User enumeration          | Generic messages on sign-in and forgot-password                                                                                          |
| Security headers + CSP    | Set in `next.config.ts`; CSP starts in report-only                                                                                       |
| Secrets                   | Never in client bundle — enforced by `@t3-oss/env-nextjs`; `.env*` gitignored                                                            |
| Env validation            | Fails the build on a missing or malformed variable                                                                                       |
| SQL injection             | Drizzle parameterised queries only; no raw string interpolation                                                                          |
| Rate limiting             | **Deferred to Phase 1** (needs Redis). Supabase's built-in auth rate limits apply meanwhile — noted as a known gap, not silently skipped |
| Audit logging             | Phase 1                                                                                                                                  |

## 11. Tests

**Unit (Vitest)**

- env schema rejects missing/malformed vars, accepts a valid set
- success and error envelopes match §16 byte-for-byte
- `AppError` → correct HTTP status and code; unknown error leaks nothing
- redirect guard rejects `//evil.com`, `https://evil.com`, `/\evil.com`; accepts `/dashboard`

**E2E (Playwright)**

- landing page renders and is responsive at 390px
- sign-up → email confirm (via Supabase test inbox) → sign-in → `/dashboard` → sign-out
- unauthenticated `/dashboard` redirects to `/sign-in?next=/dashboard`

E2E requires live Supabase credentials; the job is skipped in CI when the secret is absent
and logs that it was skipped (never reported as passing).

## 12. Documentation Updates

- `CLAUDE.md` — working rules, the no-RLS isolation contract, layer boundaries
- `README.md` — setup, Supabase project creation, scripts
- `docs/architecture.md`, `docs/database.md`
- This plan updated with a completion record

## 13. Completion Checklist (§34 exit criteria)

Verified locally on 2026-07-24:

- [x] `pnpm build` succeeds — 12 routes, no warnings
- [x] `pnpm typecheck` clean under `strict`
- [x] `pnpm lint` clean
- [x] `pnpm format:check` clean
- [x] `pnpm test` — 52 unit tests green
- [x] `pnpm test:e2e` — 24 passed, 4 skipped (the four that need live credentials,
      skipped with a stated reason rather than silently passing)
- [x] `/dashboard` is unreachable when signed out — verified end-to-end
- [x] Open-redirect guard wired into the sign-in page — verified end-to-end
- [x] Security headers served — verified end-to-end
- [x] `/api/health` reports honest status — verified end-to-end
- [x] CI runs typecheck, lint, format, test, and build on push and PR
- [x] Docs written: `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/database.md`
      Verified against the live project (`nhrnkfbabzdfpxpqbhhc`, `ap-south-1`) on 2026-07-25:

- [x] **`pnpm db:migrate` applies cleanly** — both migrations applied; FK,
      expression index, triggers, and the anon/authenticated revoke all confirmed
      in the database
- [x] **`pnpm db:seed` creates the fixtures** — 5 accounts seeded, idempotent
- [x] **Sign in → dashboard → sign out** — the live Playwright journey passes;
      wrong-password returns the generic message
- [x] **Health probes green against real dependencies** — database 200, storage
      200 (bucket `eventos-public`), queue `not_configured`

Not exercised: the email-confirmation and password-reset links, which require
opening a real inbox. The code paths are covered; the round-trip is not.

## 14. Deviations From the Plan as Written

| Planned                                           | Actual                                 | Why                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware.ts`                               | `src/proxy.ts`                         | Next 16 renamed the convention                                                                                                      |
| shadcn `Button asChild`                           | `buttonVariants()` on the link         | This shadcn release is built on Base UI, which has no `asChild`                                                                     |
| Build uses `SKIP_ENV_VALIDATION` in CI            | CI supplies placeholder values instead | Skipping validation left URLs undefined and broke `metadataBase`; supplying placeholders means CI actually exercises the env schema |
| E2E on port 3000                                  | Port 3100                              | `reuseExistingServer` attached to an unrelated app already on 3000 and produced twelve bogus failures                               |
| E2E skip guard on `NEXT_PUBLIC_SUPABASE_URL`      | Explicit `E2E_LIVE_SUPABASE=true`      | The build sets a placeholder URL, so presence of the variable proved nothing and the guard did not fire                             |
| Dark mode via `next-themes`                       | `prefers-color-scheme` only            | No theme toggle in Phase 0; the dependency would be unused (rule 16)                                                                |
| Node 20                                           | Node 22 (`.nvmrc`)                     | `@supabase/supabase-js` refuses Node 20 (EOL, no native WebSocket); the seed script died on it                                      |
| Supabase env vars `ANON_KEY` / `SERVICE_ROLE_KEY` | `PUBLISHABLE_KEY` / `SECRET_KEY`       | The project uses Supabase's current `sb_publishable_` / `sb_secret_` keys, not legacy JWTs; validation now rejects a swap           |
| Singapore region assumed                          | `ap-south-1` (Mumbai)                  | The real project turned out to be in Mumbai; connection strings and docs corrected                                                  |

`CardTitle` also gained an `as` prop so auth pages have a real `<h1>` — a page
whose only title is a `<div>` has no document outline for a screen reader.

The seed script gained retry-with-backoff: Supabase's auth API intermittently
returns `bad_jwt` ("unrecognized JWT kid <nil> for ES256") on projects with the
new asymmetric signing keys — a transient upstream fault that succeeds on retry.

## 15. Phase 0 setup — complete

The project is fully wired and verified. Remaining, all optional:

1. Register the Google OAuth client if you want that flow live, then set
   `AUTH_GOOGLE_ENABLED=true`.
2. Add `http://localhost:3000/auth/callback` to the Supabase redirect allow-list
   (needed before the email-confirmation and OAuth round-trips work locally).
3. Create the Vercel project and add the environment variables for deployment.
