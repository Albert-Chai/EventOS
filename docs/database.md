# Database

Current as of Phase 2.

---

## 1. Ownership

| Schema                   | Owner    | Managed by                      |
| ------------------------ | -------- | ------------------------------- |
| `public`                 | Us       | Drizzle migrations              |
| `auth`                   | Supabase | Supabase — **never** migrate it |
| `storage`, `realtime`, … | Supabase | Supabase                        |

`drizzle.config.ts` sets `schemaFilter: ["public"]`. Relaxing that would let
`drizzle-kit` introspect Supabase's schemas and generate migrations that drop
them. Do not.

---

## 2. Connections

| Variable              | Port | Used by                  | Notes                                                 |
| --------------------- | ---- | ------------------------ | ----------------------------------------------------- |
| `DATABASE_URL`        | 6543 | The running app          | PgBouncer transaction mode; requires `prepare: false` |
| `DIRECT_DATABASE_URL` | 5432 | Migrations, seed, studio | Session mode; DDL through the pooler is unreliable    |

The app caps its pool at 5 in production, 1 in development, and reuses the
connection across hot reloads (`globalThis.__eventosSql`) so a dev session does
not leak a pool per file save.

---

## 3. Current schema

### `profiles`

Application-side user record, one per `auth.users` row.

| Column         | Type                   | Notes                                     |
| -------------- | ---------------------- | ----------------------------------------- |
| `id`           | `uuid` PK              | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `email`        | `text` NOT NULL        | Lowercased; unique on `lower(email)`      |
| `display_name` | `text`                 | From sign-up, or the OAuth provider       |
| `avatar_url`   | `text`                 | From the OAuth provider                   |
| `locale`       | `text` NOT NULL        | Default `'en'`                            |
| `created_at`   | `timestamptz` NOT NULL | Default `now()`                           |
| `updated_at`   | `timestamptz` NOT NULL | Maintained by trigger                     |

Not tenant-scoped: a user can belong to several tenants. Tenant membership
arrives in Phase 1 as `tenant_members`.

### Functions and triggers

| Object                              | Purpose                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `public.set_updated_at()`           | Keeps `updated_at` honest regardless of the write path. Reused by every table from Phase 1 on |
| `profiles_set_updated_at`           | `BEFORE UPDATE` on `profiles`                                                                 |
| `public.handle_new_user()`          | `SECURITY DEFINER`, `search_path` pinned. Creates the profile on sign-up                      |
| `on_auth_user_created`              | `AFTER INSERT` on `auth.users`                                                                |
| `public.handle_user_email_change()` | Keeps `profiles.email` in step with `auth.users.email`                                        |
| `on_auth_user_email_changed`        | `AFTER UPDATE OF email` on `auth.users`                                                       |

### Grants

```sql
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
```

Because we do not use RLS, the PostgREST roles must not be able to reach our
tables at all. **Every new table needs the same revoke** — that is what makes
"no RLS" a decision rather than an oversight.

---

## 4. Migrations

```bash
# 1. edit src/server/db/schema/*
pnpm db:generate     # writes drizzle/NNNN_*.sql
# 2. READ the generated SQL
pnpm db:migrate      # applies via DIRECT_DATABASE_URL
```

| File                                       | Kind                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `drizzle/0000_init.sql`                    | Generated — `profiles`                                                                                 |
| `drizzle/0001_auth_triggers.sql`           | **Hand-written** — FK to `auth.users`, expression index, triggers, grants                              |
| `drizzle/0002_multitenant.sql`             | Generated — tenants, members, roles, invitations, platform_admins, audit, impersonation                |
| `drizzle/0003_multitenant_constraints.sql` | **Hand-written** — auth.users FKs, `lower(slug)` index, triggers, grants, append-only audit, role seed |
| `drizzle/0004_tense_virginia_dare.sql`     | Generated — events, event_settings, event_branding, event_operating_hours                              |
| `drizzle/0005_events_constraints.sql`      | **Hand-written** — events→auth.users FK, per-tenant `lower(slug)` index, triggers, grants              |

`_journal.json` lists all six; hand-written files must be added to it manually.

### Why some objects are missing from the schema files

`drizzle-kit generate` diffs `schema/*` against `meta/*_snapshot.json`. An
object present in neither is never touched. The cross-schema FK and the
`lower(email)` unique index are therefore deliberately absent from
`schema/profiles.ts` — declaring them there would make the next generated
migration try to create them a second time.

The same applies to anything you add by hand: triggers, expression indexes,
partial indexes, grants, and views.

**Never run `drizzle-kit push` against a shared database** (spec §33.2 rule 6).

---

## 5. Conventions for every new table

- `id uuid` primary key (spec §12)
- `created_at`, `updated_at` timestamptz, plus `deleted_at` where soft deletion
  is required
- `tenant_id uuid NOT NULL` if tenant-scoped, with an index — and it must be
  the leading column of any composite index used by list queries
- `REVOKE ALL … FROM anon, authenticated` in the same migration
- the `set_updated_at` trigger

### Phase 1 additions

`tenants`, `tenant_members`, `tenant_member_roles`, `tenant_invitations`,
`roles`, `platform_admins`, `audit_logs`, `impersonation_sessions`. Notes:

- **Permissions are code, not tables.** `roles` is seeded (the 8 system roles);
  `tenant_member_roles` links a member to role keys. The role→permission map is
  `src/server/authz/roles.ts`. `permissions`/`role_permissions` tables are
  deliberately absent — they would duplicate the code and drift.
- **`audit_logs` is append-only**, enforced by the `reject_mutation()` trigger:
  UPDATE and DELETE raise. `actor_user_id` is `ON DELETE SET NULL` and there is
  no FK on `tenant_id`, so the trail outlives both users and tenants.
- **`platform_admins`** is a distinct authority axis, separate from membership.
- Tenant slug uniqueness is a partial expression index (`lower(slug)` where not
  soft-deleted), so a deleted tenant's slug can be reused.

### Phase 2 additions

`events` plus three satellites: `event_settings` (1:1 feature toggles),
`event_branding` (1:1 theme/colours; `*_file_id` upload columns reserved for
Phase 3), and `event_operating_hours` (1:many per-date). Notes:

- **Event slugs are unique _per tenant_**, not globally — a partial expression
  index on `(tenant_id, lower(slug)) WHERE deleted_at IS NULL`, because the public
  URL is `/{tenant-slug}/{event-slug}`. Two organizers may reuse a slug.
- **`status` is a nine-value union** driven by the machine in
  `src/server/events/status.ts` (`text`, not a Postgres enum — the set grows). The
  public site only exposes `published`/`live`/`ended`; drafts are invisible.
- The satellites cascade on event delete and each carry `tenant_id` (belt and
  braces: reads are scoped by tenant _and_ event id). Same-schema FKs
  (`tenant_id → tenants`, `event_id → events`) are in the generated migration;
  the cross-schema `events.created_by → auth.users` FK is hand-written in 0005.

Naming: `snake_case` columns, plural table names, `*_id` for foreign keys.

Use the generic entity names from spec §8.5 — `listing_items`, not `products`.
The same row is a menu item at a food festival and a package at a property expo;
the frontend label changes with the event type, the table name does not.

---

## 6. Seeding

```bash
pnpm db:seed
```

Creates five confirmed accounts (password `eventos-dev-password`), a platform
admin (`platform.admin@eventos.test`), and a demo tenant (Kuala Lumpur Food
Discovery Weekend) owned by `organizer.owner@eventos.test` with
`organizer.staff@eventos.test` as an event manager. Phase 2 adds two events under
that tenant: a **published** one (`street-eats`, public at
`/kl-food-weekend/street-eats`) and a **draft** (`ramadan-bazaar-trial`, which
`404`s publicly). Idempotent. Refuses to run when `NODE_ENV=production` or when
the connection string looks like production.

Merchants, booths, and analytics rows in spec §38 are added as their phases land.

---

## 7. Roadmap

| Phase | Tables                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 ✅  | `tenants`, `tenant_members`, `tenant_member_roles`, `tenant_invitations`, `roles`, `platform_admins`, `audit_logs`, `impersonation_sessions` |
| 2 ✅  | `events`, `event_settings`, `event_branding`, `event_operating_hours`                                                                        |
| 3     | `merchants`, `merchant_event_participations`, `listing_items`, `merchant_categories`, `imports`, `import_rows`                               |
| 4     | `zones`, `maps`, `map_floors`, `booths`, `booth_assignments`                                                                                 |
| 5     | `visitors`, `visitor_favourites`, `visitor_recent_views`                                                                                     |
| 6     | `plans`, `subscriptions`, `invoices`, `usage_records`, `featured_placements`                                                                 |
| 7     | `analytics_events`, `daily_event_metrics`, `daily_merchant_metrics`, `qr_codes`, `qr_scan_events`                                            |
| 8     | `vouchers`, `voucher_codes`, `voucher_claims`, `voucher_redemptions`, `campaigns`                                                            |

Full target list: spec §12.
