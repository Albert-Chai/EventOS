# Phase 2 — Event Management: Implementation Plan

Status: **complete** — verified against the live project 2026-07-25 (see §6)
Spec: `EventOS_PROJECT.md` §34 (Phase 2), §7.1 (organizer creates an event), §8.3
(event fields/statuses/settings), §12 (`events` table), §19 (event setup checklist)

---

## 1. Scope

Turn the multi-tenant platform into one that runs events: create/edit an event,
move it through its lifecycle, brand it, configure it, set operating hours,
duplicate it, and **publish it to a public page that draft events never reach**.

**In scope**

- `events`, `event_settings` (1:1), `event_branding` (1:1),
  `event_operating_hours` (1:many)
- Full 9-status lifecycle with an explicit, audited transition machine
- Create, edit, duplicate, soft-delete
- Publish / unpublish / archive / cancel
- Public event page at `/{tenant-slug}/{event-slug}` + a public tenant index
- Event setup checklist (spec §19) on the organizer overview
- Enforcement of the `event.*` permissions already defined in Phase 1
- Tenant isolation for events — **tested, not asserted**

**Out of scope** (later phases): zones, maps, booths (Phase 4); merchants and the
`merchant_onboarding` / `ready_for_review` review workflow's merchant side
(Phase 3 — the statuses exist now, the merchant flow that feeds them does not);
QR codes and analytics (Phase 7); the scheduler that would auto-advance
`published → live → ended` (needs the deferred job runner — see §7).

---

## 2. Decisions (from AskUserQuestion)

| #            | Decision                                     | Consequence                                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public URL   | **Namespaced `/{tenant-slug}/{event-slug}`** | Event slug is unique **within a tenant**, not globally — enforced by a partial unique index on `(tenant_id, lower(slug))`. Two organizers may reuse a slug. Tenant slug stays reserved at the top-level path so it can't shadow `/dashboard`, `/platform`, etc.          |
| Status model | **Full 9-status machine**                    | All nine statuses persist. Transitions are validated against an explicit map (`src/server/events/status.ts`), each audited. `live`/`ended` are set by an explicit action now; auto-advance by date is deferred to the job runner (§7).                                   |
| Data model   | **Separate satellite tables**                | `event_settings` (1:1 toggles), `event_branding` (1:1 theme/logo/cover), `event_operating_hours` (1:many). Keeps `events` lean and matches the roadmap in `docs/database.md`. Settings + branding rows are created with the event (defaults) so a 1:1 read never misses. |

---

## 3. Status lifecycle

Nine statuses (spec §8.3). The persisted `status` is authoritative; the public
site derives a display label from status + dates.

```
draft ─▶ setup ─▶ merchant_onboarding ─▶ ready_for_review ─▶ published ─▶ live ─▶ ended ─▶ archived
  │        │              │                      │               │          │        │
  └────────┴──────────────┴──────────────────────┴───────────────┴──────────┴────────┴──▶ cancelled
                                                            (published/live/ended) ─▶ archived
```

- **Forward** moves follow the chain above; a draft may also jump straight to
  `published` (small events skip setup).
- **`published` may return to `draft`** (unpublish) so a mistake is fixable.
- **`cancelled`** is reachable from any pre-archive status; it is terminal except
  for `archived`.
- **`archived`** is reachable from `published`/`live`/`ended`/`cancelled`; terminal.
- Timestamps: entering `published` stamps `published_at` (first time only);
  `archived` stamps `archived_at`. `cancelled` records the transition in audit.
- **Permission per transition**: `→ published`/`→ live` require `event.publish`;
  `→ archived` requires `event.archive`; everything else requires `event.update`.
- **Publishability gate**: `→ published` refuses unless name, `start_at`/`end_at`
  (end after start), and venue name are present (the §19 minimum). Returns
  `VALIDATION_ERROR` listing what's missing.

**Public visibility** = `status ∈ {published, live, ended}` AND
`visibility = public` AND not soft-deleted AND tenant active. Everything else —
including every `draft` — is a `404` on the public page (drafts are never
publicly accessible: the Phase 2 exit criterion).

---

## 4. Schema (migration 0004 generated + 0005 hand-written)

```
events(id, tenant_id→tenants, name, slug, event_type, short_description,
       description, venue_name, venue_address, latitude, longitude, timezone,
       start_at, end_at, status, visibility, published_at, archived_at,
       created_by, created_at, updated_at, deleted_at)
       -- UNIQUE(tenant_id, lower(slug)) WHERE deleted_at IS NULL (hand-written)

event_settings(id, tenant_id, event_id→events UNIQUE, require_visitor_login,
       enable_favourites, enable_reviews, enable_vouchers, enable_sponsors,
       enable_passport, enable_maps, enable_merchant_self_registration,
       enable_guest_browsing, show_merchant_prices, show_booth_number,
       show_operating_hours, show_social_links, created_at, updated_at)

event_branding(id, tenant_id, event_id→events UNIQUE, theme, primary_color,
       secondary_color, accent_color, logo_file_id, cover_file_id,
       created_at, updated_at)

event_operating_hours(id, tenant_id, event_id→events, date, opens_at, closes_at,
       is_closed, note, created_at, updated_at)
       -- UNIQUE(event_id, date)
```

Same-schema FKs (`tenant_id → tenants`, `event_id → events` with
`ON DELETE CASCADE`) are expressed in the schema files (generated migration).
Hand-written 0005 carries only what Drizzle cannot: the cross-schema
`events.created_by → auth.users` FK (`ON DELETE SET NULL`), the `lower(slug)`
partial unique index, the `set_updated_at` triggers, and the
`REVOKE ALL … FROM anon, authenticated` on all four tables. 0005 is added to
`_journal.json` by hand (Drizzle only tracks generated files).

`latitude`/`longitude` are `double precision`. `status`/`visibility`/`event_type`
are `text` with a documented TS union, per the `_shared.ts` convention.

---

## 5. Module order

1. Pure domain modules: `events/status.ts` (transition map + guards),
   `events/event-types.ts` (the type list). Unit-testable in isolation.
2. Audit actions (`event.*`) + any new error codes.
3. Schema files + `index.ts`; generate 0004; hand-write 0005; read SQL.
4. Repositories: `events.repository.ts` (events + public reads),
   `event-config.repository.ts` (settings, branding, hours).
5. `event.service.ts` — create (event + default settings + branding in a tx),
   update, `transitionStatus`, `publish`, `duplicate`, soft-delete, and the
   config mutations. Every mutation audits; every fetch is tenant-scoped and a
   cross-tenant id is `TENANT_MISMATCH`.
6. Feature layer (`features/events/`): Zod `schemas.ts`, `actions.ts`
   (`"use server"`), `state.ts`, components (form, list, status controls,
   settings, branding, hours editor).
7. Dashboard pages under `/dashboard/events/*`.
8. Public pages under `(public)/[tenantSlug]/*` with their own mobile-first shell.
9. Nav item + overview CTA; extend the seed with demo events.
10. Tests — unit (status machine, publishability), integration (event tenant
    isolation, against Postgres), e2e (create → publish → public page; draft 404;
    permission gating).
11. Migrate + seed + verify against the live project.
12. Docs + commit.

---

## 6. Exit criteria (§34) — verified against the live project 2026-07-25

- [x] **Organizer can create and publish an event** — the events e2e drives
      create → publish on `organizer.owner`; the seed also creates one published
      and one draft event
- [x] **Public event page is generated** at `/{tenant-slug}/{event-slug}` —
      `/kl-food-weekend/street-eats` renders the seeded event; branding, dates,
      venue, and operating hours all show
- [x] **Draft events are not publicly accessible** — `findPublicEvent` returns
      null for any non-public status, so the draft (`ramadan-bazaar-trial`) is a
      `404`; asserted in both the integration and e2e suites

Standing bars, all met: event tenant isolation proven by
`tests/integration/event-isolation.test.ts` (a member of A cannot read or update
B's event, slugs are per-tenant, drafts stay private); every mutating service
audits (`event.*` actions); typecheck/lint/format/build green.

**Totals:** 99 unit/integration tests (14 new: status machine + event isolation),
40 e2e (4 new for events), across mobile + desktop. Migrations `0004`+`0005`
applied and the seed re-run against `nhrnkfbabzdfpxpqbhhc`.

## 7. Deviations from the plan

| Planned                             | Actual                                                   | Why                                                                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest files run in parallel        | `fileParallelism: false`                                 | A second integration file made two suites hit the Supabase pooler at once; the catalog introspection hit `statement_timeout`. Serialising the files removes the contention (the suite is small). |
| Auto-advance `published→live→ended` | Manual transitions; public label derived from dates      | The scheduler needs the deferred job runner. Statuses are set explicitly; `eventPhase` still shows the right label from the dates.                                                               |
| Logo/cover uploads                  | `*_file_id` columns reserved; branding is theme + colors | Storage upload flow lands with merchant media in Phase 3.                                                                                                                                        |

---

## 8. Known gaps carried forward

- **No scheduler** to auto-advance `published → live → ended` by date. The
  statuses are set explicitly for now; the display label on the public page is
  derived from the dates so a visitor still sees "Live"/"Ended" correctly. Wiring
  the automatic transition waits for the job runner (same deferral as rate
  limiting — needs Redis/queue infrastructure).
- **File uploads** for logo/cover are modelled as `*_file_id` columns now;
  the Storage upload flow for event branding lands with the merchant media work
  in Phase 3. Until then branding is theme + colors, with the file columns
  reserved.
- `merchant_onboarding` / `ready_for_review` are reachable but their merchant-side
  workflow arrives in Phase 3.
