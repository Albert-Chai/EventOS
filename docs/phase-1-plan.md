# Phase 1 — Multi-Tenant Platform: Implementation Plan

Status: **complete** — see §6 for verification, §7 for deviations
Spec: `EventOS_PROJECT.md` §34 (Phase 1), §4 (roles), §5 (multi-tenant), §14
(authorization), §23 (audit)

---

## 1. Scope

Turn the Phase 0 skeleton into a real multi-tenant platform: tenants, membership,
role-based permissions, a platform-admin console, audit logging, a tenant
switcher, support impersonation, and — the point of the whole phase — **tenant
isolation that is tested, not asserted**.

**In scope**

- `tenants`, `tenant_members`, `tenant_invitations`, `roles`,
  `tenant_member_roles`, `platform_admins`, `audit_logs`, `impersonation_sessions`
- Code-defined permissions + system-role→permission map
- `RequestContext` gains `isPlatformAdmin`, `tenant`, `permissions`,
  `memberships`, `impersonation`
- Policies: `requireTenant`, `requirePermission`, `requirePlatformAdmin`
- Repositories/services for all of the above, every mutation audited
- Platform console (`/platform/*`), organizer dashboard shell + tenant switcher,
  team management, invitation accept flow
- Support **impersonation** with re-auth, time-box, audit, and a banner
- Tenant-isolation tests (unit + e2e)

**Out of scope** (later phases): events, merchants, booths, billing/plans
(tenant carries a placeholder `plan` column), rate limiting (still Phase 1-todo,
needs Redis — tracked as a known gap).

---

## 2. Decisions (from AskUserQuestion)

| #              | Decision                                                   | Consequence                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RBAC           | **System roles + code-defined permissions**                | Permissions are a TS union (source of truth, unit-tested). `roles` seeded as system rows; `tenant_member_roles` links members to roles by stable `role_key`. **`permissions` / `role_permissions` tables are intentionally NOT created** — they would duplicate the code map and drift (rule 16). Documented in `docs/database.md`. |
| Platform admin | **Dedicated `platform_admins` table**                      | A distinct axis of authority, resolved to `ctx.isPlatformAdmin`. Never a tenant role.                                                                                                                                                                                                                                               |
| Onboarding     | **Platform admin creates tenant + invites owner by email** | Self-serve org signup deferred. A signed-in user with no membership sees a "no workspace yet" state.                                                                                                                                                                                                                                |
| Impersonation  | **Full, in Phase 1**                                       | Server-side `impersonation_sessions`, opaque cookie, actor-match + platform-admin + expiry checks, `user.impersonation_*` audit events, sticky banner, stop action.                                                                                                                                                                 |

---

## 3. Authorization model

Two independent axes:

1. **Platform authority** — `ctx.isPlatformAdmin`, from `platform_admins`. Gates
   `/platform/*` and cross-tenant operations. Not a permission; a boolean.
2. **Tenant authority** — within the _active_ tenant, `ctx.permissions` is the
   union of the member's roles' permissions.

Permissions (`src/server/authz/permissions.ts`) are the §14 list as a TS union.
`ROLE_PERMISSIONS` maps each §4.3 system role to its set. Only the permissions
Phase 1 actually enforces (`tenant.view/update/manage_members`,
`settings.manage`, `audit.view`) are exercised now; the rest are defined and
reserved for their phases so nothing is renamed later.

**Active tenant.** A user may belong to several tenants. The active one comes
from a validated `eventos-tenant` cookie, defaulting to the earliest membership.
The switcher sets it. `tenant_id` is still never read from a request body — the
cookie only _selects among tenants the user already belongs to_, and every
selection is re-validated against membership server-side.

**Impersonation overlay.** When an `eventos-impersonation` cookie points at a
live session whose `actor_user_id` is the current (platform-admin) user, the
active tenant becomes the impersonated tenant and permissions become the tenant
Owner set. `ctx.user` stays the admin — so audit always records the real actor —
and `ctx.impersonation` is set, driving the banner and the audit `via_impersonation`
flag.

---

## 4. Schema (migration 0002 generated + 0003 hand-written)

```
tenants(id, name, slug UNIQUE, legal_name, registration_number, contact_name,
        contact_email, contact_phone, country, timezone, currency, status,
        plan, custom_domain, logo_file_id, created_at, updated_at, deleted_at,
        created_by)
tenant_members(id, tenant_id→tenants, user_id→auth.users, status, invited_by,
        invited_at, joined_at, created_at, updated_at, UNIQUE(tenant_id,user_id))
tenant_invitations(id, tenant_id, email, role_keys text[], token_hash UNIQUE,
        status, invited_by, expires_at, accepted_at, accepted_user_id,
        created_at, updated_at)
roles(key PK, name, description, is_system, sort_order)   -- seeded
tenant_member_roles(tenant_member_id→tenant_members, role_key→roles,
        PK(tenant_member_id, role_key))
platform_admins(user_id PK→auth.users, granted_by, granted_at, note, created_at)
audit_logs(id, actor_user_id, tenant_id, action, resource_type, resource_id,
        before_json, after_json, via_impersonation, ip_address, user_agent,
        created_at)
impersonation_sessions(id, actor_user_id→auth.users, tenant_id→tenants, reason,
        started_at, expires_at, ended_at, ip_address, user_agent, created_at)
```

Hand-written 0003: `set_updated_at` triggers, `REVOKE ALL … FROM anon,
authenticated` on every table, tenant-scoped indexes (`tenant_id` leading),
and the seed for `roles`. Cross-schema FKs to `auth.users` are hand-written
(Drizzle can't express them), same pattern as Phase 0.

---

## 5. Module order

1. Permissions + roles (code) — the source of truth
2. Schema files + migrations
3. `RequestContext` + session resolution (platform admin, memberships, active
   tenant, permissions, impersonation)
4. Policies (`requireTenant`, `requirePermission`, `requirePlatformAdmin`)
5. Repositories (tenant-scoped take `TenantContext`; platform repos require admin)
6. Services with audit on every mutation
7. Impersonation service + cookie plumbing
8. UI — dashboard shell + switcher + no-workspace; team + invite accept;
   platform console; impersonation banner
9. Tests — unit (permission map, isolation, invitation, impersonation guard) +
   e2e (create→invite→accept, cross-tenant denial, impersonation)
10. Migrate + seed + verify against the live project
11. Docs + commit

---

## 6. Exit criteria (§34) — verified against the live project 2026-07-25

- [x] **Platform admin can create a tenant** — `/platform/tenants/new`; the demo
      tenant is created by the seed and the flow is covered by the platform e2e
- [x] **Organizer can access only its own tenant** — the isolation integration
      test (`tests/integration/tenant-isolation.test.ts`) runs against Postgres:
      a member of A gets null for B's membership, no member leakage, tenant-scoped
      invitation lookups
- [x] **Permission tests pass** — `tests/unit/authz.test.ts` (role→permission
      map) plus the e2e proving `event_manager` is both hidden from and blocked
      at `/dashboard/team`
- [x] **Audit logs created for sensitive actions** — every mutating service calls
      `recordAudit`; the table is append-only (DB trigger); actions cover tenant
      create/update/suspend, invite/join/roles/remove, admin grant/revoke,
      impersonation start/stop
- [x] **Impersonation** — platform-admin-only, 30-min server-side session,
      actor-matched each request, audited with `via_impersonation`, and shown in a
      persistent banner; e2e drives start → banner → stop

**Totals:** 81 unit/integration tests, 18 e2e (mobile), typecheck/lint/format/build
all green. Migrations applied and seed run against `nhrnkfbabzdfpxpqbhhc`.

---

## 7. Deviations from the plan

| Planned                                   | Actual                                                      | Why                                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissions` + `role_permissions` tables | Code-only permission map                                    | Tables would duplicate `roles.ts` and drift; only `roles` + `tenant_member_roles` exist                                                                       |
| Owner auto-provisioned on tenant create   | Owner linked only if the account exists, else "invite them" | Provisioning a passwordless user with no way in is worse than an explicit invite                                                                              |
| Global sign-out                           | Local scope (`signOut({ scope: "local" })`)                 | Signing out one device shouldn't revoke every session; the global default also let one session's sign-out kill another mid-request (surfaced by parallel e2e) |
| Transactional invite email                | Invite link shown to the admin to share                     | No transactional email until Phase 3; we don't pretend to send one                                                                                            |
| —                                         | Added `audit_logs` append-only DB trigger                   | An audit trail the app can rewrite isn't one                                                                                                                  |

Rate limiting and recent-auth (re-auth for the most sensitive actions) remain
deferred, as noted in `CLAUDE.md`.
