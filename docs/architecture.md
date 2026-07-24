# Architecture

Current as of Phase 0. Update this file whenever the shape changes
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
| Rate limiting                     | ❌ Phase 1 (needs Redis). Supabase auth limits apply meanwhile     |
| Audit logging                     | ❌ Phase 1                                                         |
| Recent-auth for sensitive actions | ❌ Phase 1                                                         |

---

## 8. What Phase 1 changes

- `RequestContext` gains `tenant`, `permissions`, `isPlatformAdmin`.
- `requireTenant()` and `requirePermission()` join `requireUser()` in `policies/`.
- Every repository function takes an `AuthenticatedContext` and filters on
  `tenant_id`.
- `audit_logs` is written by the service layer after every state-changing action.
- Rate limiting arrives with Redis.

No call site above the policy layer should need to change — that is what the
Phase 0 seam is for.
