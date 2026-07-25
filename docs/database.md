# Database

Current as of Phase 6.

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
"no RLS" a decision rather than an oversight. (Object _storage_ is a separate
surface: the `eventos-public` bucket is public-read and written only by the
server-side media service — see CLAUDE.md §6.)

---

## 4. Migrations

```bash
# 1. edit src/server/db/schema/*
pnpm db:generate     # writes drizzle/NNNN_*.sql
# 2. READ the generated SQL
pnpm db:migrate      # applies via DIRECT_DATABASE_URL
```

| File                                       | Kind                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle/0000_init.sql`                    | Generated — `profiles`                                                                                                                |
| `drizzle/0001_auth_triggers.sql`           | **Hand-written** — FK to `auth.users`, expression index, triggers, grants                                                             |
| `drizzle/0002_multitenant.sql`             | Generated — tenants, members, roles, invitations, platform_admins, audit, impersonation                                               |
| `drizzle/0003_multitenant_constraints.sql` | **Hand-written** — auth.users FKs, `lower(slug)` index, triggers, grants, append-only audit, role seed                                |
| `drizzle/0004_tense_virginia_dare.sql`     | Generated — events, event_settings, event_branding, event_operating_hours                                                             |
| `drizzle/0005_events_constraints.sql`      | **Hand-written** — events→auth.users FK, per-tenant `lower(slug)` index, triggers, grants                                             |
| `drizzle/0006_massive_madame_masque.sql`   | Generated — merchants, merchant_members, merchant_invitations, merchant_categories, participations, listing_items                     |
| `drizzle/0007_merchants_constraints.sql`   | **Hand-written** — merchant→auth.users FKs, per-tenant `lower(slug)` indexes, triggers, grants                                        |
| `drizzle/0008_petite_harry_osborn.sql`     | Generated — files, zones, maps, map_floors, booths, booth_assignments (+ FKs from the reserved `*_file_id` columns)                   |
| `drizzle/0009_booths_constraints.sql`      | **Hand-written** — files/assignment→auth.users FKs, `lower(booth_number)` + "one active assignment" partial indexes, triggers, grants |
| `drizzle/0010_organic_psynapse.sql`        | Generated — visitors, visitor_favourites, visitor_recent_views (+ FKs to tenants/events/participations/merchants)                     |
| `drizzle/0011_visitors_constraints.sql`    | **Hand-written** — `visitors.user_id → auth.users` (SET NULL) FK, triggers on visitors + visitor_recent_views, grants                 |
| `drizzle/0012_awesome_blur.sql`            | Generated — plans, subscriptions, invoices, usage_records, featured_placements (+ FKs to tenants/events/participations/merchants/plans) |
| `drizzle/0013_monetization_constraints.sql`| **Hand-written** — `featured_placements.created_by → auth.users` (SET NULL) FK, the "one open placement" partial unique index, triggers on plans/subscriptions/invoices/featured_placements, grants |

`_journal.json` lists all fourteen; hand-written files must be added to it manually.

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

### Phase 3 additions

`merchants` + the merchant authority axis (`merchant_members`,
`merchant_invitations`), `merchant_categories`, `merchant_event_participations`,
and `listing_items`. Notes:

- **A second authority axis.** `merchant_members` links `auth.users` to a
  merchant, the way `tenant_members` links to a tenant. A merchant is reachable
  two ways — by an organizer (scoped by `tenant_id`) or by a merchant member
  (scoped by `merchant_id` derived from membership) — and both are enforced in
  the repository layer, never from a client value.
- **Merchant/category slugs are unique per tenant** (partial `lower(slug)`
  expression indexes; merchants' also excludes soft-deleted rows).
- **The approval workflow** lives on `merchant_event_participations.approval_status`
  (`src/server/merchants/status.ts`) — the spec's separate `participation_status`
  is folded in. `listing_items` are event-scoped (per participation) and carry
  `tenant_id`, `merchant_id`, and `event_id` so any read scopes on whichever axis
  is asking. `price`/`promo_price` are `numeric`; `dietary_tags` is `text[]`.
- Cross-schema `auth.users` FKs (`merchant_members.user_id` etc.) and the
  expression indexes are hand-written in 0007.

### Phase 4 additions

`files` (the media record), plus the floor plan: `zones`, `maps`, `map_floors`,
`booths`, `booth_assignments`. Notes:

- **The media pass.** `files` is one row per object in the `eventos-public`
  bucket, written only through the repository layer with a scoped `tenant_id`.
  The reserved `*_file_id` columns on `event_branding`, `merchants`, and
  `listing_items` now carry same-schema FKs to `files` (`ON DELETE SET NULL`), as
  does `map_floors.image_file_id`. Objects are written by the one sanctioned
  service-role Storage path (`src/server/media/storage.ts`) to a
  server-constructed, tenant-leading key — see CLAUDE.md §6.
- **Booth coordinates are normalized 0..1** (`double precision`), taken as the
  booth's _centre_ on the floor image, so a booth renders correctly at any size.
- **Booth-number uniqueness is per event** — a `lower(booth_number)` expression
  index (hand-written in 0009).
- **One active assignment per booth and per participation** — partial unique
  indexes `WHERE status <> 'cancelled'`, so reassigning is cancel-then-insert and
  the assignment history is preserved. The booth's own `status` is kept in step by
  the service (`src/server/booths/status.ts`).
- **The public map read filters by public status** (`listBoothsForEventPublic`):
  a booth links to a merchant only when the assignment is active, the
  participation is `approved`, and the merchant is active — the Phase 2/3 seam.
- Cross-schema `auth.users` FKs (`files.created_by`,
  `booth_assignments.assigned_by`) are hand-written in 0009.

### Phase 5 additions

The visitor experience: `visitors`, `visitor_favourites`, `visitor_recent_views`.
Notes:

- **`visitors` is not tenant-scoped.** A visitor is a person moving across events
  and organizers, identified by an anonymous `anonymous_id` (unique) carried in the
  `eventos_vid` httpOnly cookie; a row is created lazily on the first favourite or
  view, so plain browsing writes nothing. `user_id` is a **reserved** nullable FK
  to `auth.users` (`ON DELETE SET NULL`, hand-written in 0011) for a future
  account link — no visitor auth ships in Phase 5.
- **Favourites and recent-views _are_ tenant-scoped** (`tenant_id`, `event_id`,
  `participation_id`, `merchant_id` FKs, all `ON DELETE CASCADE`) but are read by
  **visitor + event**, not by tenant — the visitor id is the device identity, like
  a user id, and is derived from the cookie server-side, never from the client.
  Each has a `unique(visitor_id, participation_id)` so a save/view is idempotent
  (a re-view bumps `viewed_at`; a re-save is a no-op).
- **The directory read filters by public status**, the same seam as Phase 2–4:
  `searchPublicDirectory` returns a merchant only when its participation is
  `approved` and the merchant is active. Postgres full-text (`to_tsvector` +
  `websearch_to_tsquery`, both `simple`) ranks the query against a document built
  from the merchant, listing, category, item text, and booth/zone; the MVP filters
  (category, zone, halal, promo, price) narrow it. Un-indexed at MVP scale — a
  stored `tsvector` + GIN is the noted upgrade.
- `visitor_favourites` has **no `updated_at`** (rows are insert/delete only), so it
  carries no `set_updated_at` trigger; `visitors` and `visitor_recent_views` do.

### Phase 6 additions

Monetization: `plans`, `subscriptions`, `invoices`, `usage_records`,
`featured_placements`. Notes:

- **`plans` is a platform catalog, not tenant-scoped** — the natural key is `key`
  (`starter` … `enterprise`), like `roles`. `limits` is a `jsonb` `{ metric:
  number }` map (an omitted metric ⇒ unlimited) and `features` a `text[]` of
  entitlement keys. The **source of truth is code** (`server/billing/plans.ts`);
  the seed writes the rows and enforcement reads the code definitions.
- **`subscriptions` is one row per tenant** (`unique(tenant_id)`), referencing a
  plan by `plan_key`. A plan change updates it; `invoices` keep the history.
  `external_ref` reserves the Stripe id (billing is simulated — no Stripe).
- **`invoices`** snapshot `amount_cents` + `plan_key` so a later price edit never
  rewrites past invoices; `number` is globally unique.
- **`usage_records` is an append-only ledger** (created_at only, no
  updated_at/trigger) written by `recordUsage` for the event-driven §22 metrics
  (email/SMS/push/QR/API/vouchers). The four "live" metrics (events, merchants,
  team, storage) are **counted from their source tables**, never recorded here.
- **`featured_placements`** (tenant + event scoped): a null `ends_at` = the open
  (currently-featured) placement, enforced by a partial unique index
  (`WHERE ends_at IS NULL`); unfeaturing sets `ends_at` (keeps history). Granting
  is gated by the plan's `featured_listings` entitlement and sets the
  participation's `featured_rank`, which the Phase 5 directory already orders by.
- Cross-schema `auth.users` FK (`featured_placements.created_by`) is hand-written
  in 0013; every table repeats the `REVOKE ALL … FROM anon, authenticated`.

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
`404`s publicly). Phase 3 adds a merchant (`nasi-lemak-bangsar`, managed by
`merchant.owner@eventos.test`) with an **approved** listing and three items in the
published event, so the public merchant page works out of the box. Phase 4 adds a
floor plan, two zones, five booths, and a confirmed assignment (Nasi Lemak Bangsar
in booth A-1), plus a seeded merchant logo — exercising the media pass end to end.
Phase 5 adds a demo `visitors` row (`anonymous_id = seed-demo-visitor`) with one
favourite and one recent view; set the cookie `eventos_vid=seed-demo-visitor` in
the browser to browse as that visitor. Phase 6 seeds the four `plans`, puts the
demo tenant on **Growth** with one paid `invoice`, and features the seeded
merchant (a `featured_placements` row + `featured_rank`). Idempotent. Refuses to
run when `NODE_ENV=production` or when the connection string looks like
production.

Analytics rows in spec §38 are added as their phases land.

---

## 7. Roadmap

| Phase | Tables                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 ✅  | `tenants`, `tenant_members`, `tenant_member_roles`, `tenant_invitations`, `roles`, `platform_admins`, `audit_logs`, `impersonation_sessions`                        |
| 2 ✅  | `events`, `event_settings`, `event_branding`, `event_operating_hours`                                                                                               |
| 3 ✅  | `merchants`, `merchant_members`, `merchant_invitations`, `merchant_categories`, `merchant_event_participations`, `listing_items` (`imports`/`import_rows` deferred) |
| 4 ✅  | `files`, `zones`, `maps`, `map_floors`, `booths`, `booth_assignments`                                                                                               |
| 5 ✅  | `visitors`, `visitor_favourites`, `visitor_recent_views`                                                                                                            |
| 6 ✅  | `plans`, `subscriptions`, `invoices`, `usage_records`, `featured_placements` (`subscription_items`/`payments` deferred)                                              |
| 7     | `analytics_events`, `daily_event_metrics`, `daily_merchant_metrics`, `qr_codes`, `qr_scan_events`                                                                   |
| 8     | `vouchers`, `voucher_codes`, `voucher_claims`, `voucher_redemptions`, `campaigns`                                                                                   |

Full target list: spec §12.
