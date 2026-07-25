# Architecture

Current as of Phase 1. Update this file whenever the shape changes
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

| Control                           | State                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| HTTP-only cookie sessions         | ✅                                                                 |
| Password hashing                  | ✅ Supabase                                                        |
| CSRF                              | ✅ Server Action origin check                                      |
| Input validation                  | ✅ Zod, server-side                                                |
| Open-redirect guard               | ✅ `safeRedirectPath`, unit-tested against the standard bypass set |
| User-enumeration resistance       | ✅ generic sign-in and reset responses                             |
| Security headers                  | ✅ HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy        |
| CSP                               | ⚠️ report-only; enforce once the report log is clean               |
| Secret/client boundary            | ✅ enforced at build time by `@t3-oss/env-nextjs`                  |
| SQL injection                     | ✅ Drizzle parameterised queries only                              |
| PostgREST exposure                | ✅ revoked on `public.profiles`; repeat for every new table        |
| Audit logging                     | ✅ append-only `audit_logs`, written by the service layer          |
| Rate limiting                     | ❌ needs Redis. Supabase auth limits apply meanwhile               |
| Recent-auth for sensitive actions | ❌ deferred                                                        |

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

### What Phase 2 changes

- `events` and friends arrive as the first tenant-scoped _domain_ tables; the
  repository pattern (derive `tenant_id` from `ctx.tenant.id`) applies unchanged.
- Event-level permissions (`event.create`, `event.publish`, …) are already
  defined and mapped to roles; Phase 2 wires their enforcement.
