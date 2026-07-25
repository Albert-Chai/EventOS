# Phase 4 — Booths, Maps & Media: Implementation Plan

Status: **complete** — verified against the live project 2026-07-25 (see §8)
Spec: `EventOS_PROJECT.md` §34 (Phase 4), §8.6 (booth/zone/map management), §8.9
(search/filter on the map), §12/§13 (tables), §14 (`booth.manage`/`map.manage`),
§17 (`/dashboard/events/{eventId}/booths|map`, public `/map`), §18/§19 (UX +
setup checklist).

---

## 1. Scope

Give an event a floor plan and put merchants on it. An organizer creates **zones**,
uploads a **floor map** image, plots **booths** on it (a coordinate editor),
**assigns** a merchant's participation to a booth; the merchant **confirms** their
booth from the portal; a visitor opens a **public interactive map**, pans/zooms,
searches, and taps a booth to open the merchant.

Phase 4 also lands the long-deferred **media pass**: the reserved `*_file_id`
columns across the app finally light up on a real Supabase Storage upload flow.

**In scope**

- `files` — the media record; a Storage-backed upload primitive reused everywhere.
- `zones`, `maps`, `map_floors`, `booths`, `booth_assignments` (spec §12).
- Booth coordinate editor over an uploaded floor image (drag to place; MVP
  image-based map, not GIS — spec §8.6).
- Merchant assignment (organizer) + booth confirmation (merchant) — the §7 loop.
- Public interactive map: zoom/pan, clickable booths, highlight, search, filter
  by zone/category, deep-link `?booth=`, "show my location" (consented).
- **Full media pass** (by decision): map floor images **and** merchant
  logo/cover, listing-item images, event branding logo/cover — every reserved
  `*_file_id` column renders.

**Out of scope** (later phases / a focused follow-up)

- CSV import of booths/zones (spec §8.14) — the `imports` pipeline is still deferred.
- Sponsor placements / map highlight as a _featured_ type (Phase 6).
- Booth booking fees / reservations payment (Phase 6 monetization).
- Image cropping/transforms and thumbnail generation — we store the original and
  render responsively; Supabase image transforms can be layered later.
- Real-time GPS positioning beyond the browser's one-shot `geolocation` fix.

---

## 2. Decisions (from AskUserQuestion)

| #                | Decision                      | Consequence                                                                                                                                                                                                                                      |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Media pass       | **Full**                      | Build the upload primitive (`files` + a Storage-only client + a reusable `<ImageUploadField>`) and wire **every** reserved `*_file_id`: map floors, merchant logo/cover, listing-item images, event branding logo/cover.                         |
| Assignment       | **`booth_assignments` table** | A dedicated row links a booth to a participation with its own status + history (assigned → confirmed → cancelled). One active assignment per booth **and** per participation (partial unique indexes). The booth's own `status` is kept in sync. |
| Merchant confirm | **Included**                  | The merchant sees their assigned booth in `/merchant/[merchantId]/listings/[participationId]` and confirms it; the organizer's booth view shows confirmation state.                                                                              |

---

## 3. The media primitive — the one sanctioned Storage path

The reserved `*_file_id` columns have waited since Phase 2 for a real upload
flow. Phase 4 builds it once and reuses it.

- **`files`** is a normal tenant-scoped `public` table, written **only** through
  `files.repository.ts` with a `tenant_id` derived from context — the §1 isolation
  contract is untouched.
- **Object storage is not our Postgres schema.** The `eventos-public` bucket is
  Supabase-owned; the no-RLS / `REVOKE` contract governs PostgREST access to
  `public.*`, not Storage objects. Writing an object therefore needs the
  service-role Storage API — the anon key can't without Storage RLS policies,
  which would reintroduce the very row-security model we deliberately don't use.
- So there is **one** sanctioned service-role use in request paths:
  `src/server/media/storage.ts` exposes `getUploadBucket()` — service-role, **Storage
  only**. It never touches `public.*`. CLAUDE.md §6 documents this as the single,
  narrow exception to rule 5, justified because (a) it's not our schema and (b)
  the object path is **server-constructed** from `ctx.tenant.id` + entity ids, so
  there is no client-controlled tenant scoping — the same guarantee we get from
  the repository layer, applied to a storage path.
- Path shape: `{tenantId}/{scope}/{ownerId}/{uuid}.{ext}` — tenant-leading, so a
  path can never address another tenant's object.
- The bucket is public, so reads need no signing: `publicFileUrl(file)` returns
  `…/storage/v1/object/public/{bucket}/{path}`. `next.config` already whitelists
  that path and the CSP already allows the origin in `img-src`.
- Uploads come in as multipart `FormData` on a Server Action; `next.config`
  raises `serverActions.bodySizeLimit` to `8mb`. The media service validates
  mime (`image/png|jpeg|webp|avif`) and size server-side before the object is written.

`media.service.ts` is the seam: `attachImage(ctx, { scope, ownerId, file })`
validates → uploads → inserts the `files` row → returns the id; the caller sets
the entity's `*_file_id` and audits. `detachImage` clears the column and removes
the object best-effort.

---

## 4. Authorization

Nothing new on the axes — Phase 1 already defined `booth.manage` and `map.manage`
and wired them to `owner` + `event_manager`. Phase 4 **enforces** them:

- **Zones, booths, assignments** — organizer, `requirePermission("booth.manage")`.
- **Maps, floors, floor-image upload** — organizer, `requirePermission("map.manage")`.
- **Booth confirmation** — the merchant, `requireMerchantMember(merchantId)`; the
  assignment must point at a participation the merchant owns.
- **Media** — gated by the surface it attaches to: map image → `map.manage`;
  event branding → `event.update`; a merchant's logo/cover/item image → whoever
  may edit that merchant (organizer `merchant.update`, or the merchant member).

Public map reads follow the Phase 2/3 seam: **filter by public status, never a
membership check**. A booth links to a merchant only when the merchant has a
`confirmed`/`assigned` active assignment **and** the participation is `approved`
under a public event; otherwise the booth renders as a plain, unlinked shape.

---

## 5. Status machines (`src/server/booths/status.ts`, pure + unit-tested)

**Booth status** (spec §8.6): `available · reserved · assigned · confirmed ·
blocked · cancelled`. Assignable only from `available`/`reserved`.

**Assignment status**: `assigned → confirmed`, and either → `cancelled`
(terminal). The booth's `status` is kept in step:

```
assign      : booth available|reserved → assigned      ; assignment: (new) assigned
confirm     : booth assigned           → confirmed      ; assignment: assigned → confirmed   (merchant)
unassign    : booth assigned|confirmed → available      ; assignment: * → cancelled           (organizer)
block/reserve/reopen : organizer sets available|reserved|blocked directly (no active assignment)
```

One active (`status <> 'cancelled'`) assignment per booth and per participation,
enforced by partial unique indexes — reassigning means cancel then assign.

---

## 6. Schema (migration 0008 generated + 0009 hand-written)

```
files(id, tenant_id→tenants, bucket, path, kind, mime_type, size_bytes,
      width, height, original_name, created_by, created_at, updated_at)
      -- UNIQUE(bucket, path); created_by→auth.users SET NULL

zones(id, tenant_id→tenants, event_id→events, name, description, color,
      display_order, created_at, updated_at)

maps(id, tenant_id→tenants, event_id→events, name, description,
     display_order, created_at, updated_at)

map_floors(id, tenant_id→tenants, event_id→events, map_id→maps,
      name, image_file_id→files SET NULL, image_width, image_height,
      display_order, created_at, updated_at)

booths(id, tenant_id→tenants, event_id→events, zone_id→zones SET NULL,
      map_floor_id→map_floors SET NULL, booth_number, name,
      x, y, width, height, rotation, status, created_at, updated_at)
      -- UNIQUE(event_id, lower(booth_number))

booth_assignments(id, tenant_id→tenants, event_id→events,
      booth_id→booths, participation_id→participations, merchant_id→merchants,
      status, assigned_by, assigned_at, confirmed_at, note, created_at, updated_at)
      -- UNIQUE(booth_id) WHERE status<>'cancelled'
      -- UNIQUE(participation_id) WHERE status<>'cancelled'
      -- assigned_by→auth.users SET NULL
```

Coordinates `x,y,width,height` are `double precision` **normalized 0..1** to the
floor image, so a booth renders correctly at any display size. `rotation` is
degrees. Same-schema FKs live in the schema files (generated 0008); cross-schema
`auth.users` FKs, the `lower(booth_number)` + partial-unique assignment indexes,
the `set_updated_at` triggers, and the `REVOKE ALL … FROM anon, authenticated`
on all six tables are hand-written in 0009 and added to `_journal.json` by hand.

The **full media pass** also adds same-schema FKs from the existing reserved
columns to `files` (`ON DELETE SET NULL`): `merchants.logo_file_id`/`cover_file_id`,
`listing_items.image_file_id`, `event_branding.logo_file_id`/`cover_file_id`.
These are ALTERs in 0008.

---

## 7. Module order

1. Pure domain: `server/booths/status.ts` (booth + assignment machines, labels,
   colors); audit codes (`zone.*`, `map.*`, `booth.*`, `file.*`).
2. Media primitive: `files` schema; `server/media/storage.ts` (Storage-only
   client + path builder + `publicFileUrl`); `files.repository.ts`;
   `media.service.ts` (`attachImage`/`detachImage`); `<ImageUploadField>` +
   `MediaImage` components; bump `bodySizeLimit`.
3. Schema files (`zones`, `maps`, `map_floors`, `booths`, `booth_assignments`) +
   the reserved-column FK wiring; `index.ts`; generate 0008; hand-write 0009;
   read SQL; migrate.
4. Repositories: `zones`, `maps` (+ floors), `booths`, `booth-assignments`,
   `files` — organizer (tenant-scoped), merchant (membership-scoped, assignment
   read), and public (approved-only) reads.
5. Services: `zone`, `map`, `booth`, `booth-assignment` (assign/confirm/unassign),
   media wiring — every mutation audited, every fetch scoped.
6. Policies unchanged; add nothing (reuse `requirePermission*` + `requireMerchantMember`).
7. Organizer UI: `/dashboard/events/[eventId]/zones`, `/booths` (list + coordinate
   editor + assign), `/map` (floors + image upload). Overview: link + checklist.
8. Merchant portal: assigned-booth card + confirm on the listing page; wire
   logo/cover uploads (merchant form) and item image (products editor).
9. Event branding form: wire logo/cover uploads.
10. Public: `/[tenantSlug]/[eventSlug]/map` interactive map; "View map" shortcut
    on the event page; "Find on map" on merchant detail. Render merchant/item
    images where present.
11. Seed: two zones, a map + floor (with a bundled placeholder image), a few
    booths, one **confirmed** assignment for the seeded merchant, a merchant logo.
12. Tests: unit (booth + assignment machines), integration (booth isolation +
    assignment scoping + public-map-shows-approved-only), e2e (create floor +
    booth → assign → merchant confirms → public map click opens merchant).
13. Migrate + seed + verify live; docs + `CLAUDE.md` + memory; commit.

---

## 8. Exit criteria (§34) — verified against the live project 2026-07-25

- [x] **Organizer can create booths** — the Booths page adds booths, plots them on
      the uploaded floor plan (drag-to-place), and manages zones + floors; the e2e
      drives booth creation.
- [x] **Merchant can be assigned** — the organizer assigns a participation to a
      booth; the merchant confirms it from `/merchant` (assigned → confirmed), and
      the organizer sees the confirmation.
- [x] **Visitor can click a booth on the map** — the public interactive map opens
      the merchant for a booth with an approved, confirmed assignment; the e2e
      clicks booth A-1 and lands on the merchant's menu.

Standing bars, all met: booth/assignment isolation proven by
`tests/integration/booth-isolation.test.ts` (cross-tenant invisibility,
tenant-scoped assignment lookups, public-shows-approved-only); the booth +
assignment machines unit-tested; every mutation audited; the media primitive keeps
all `public.*` writes on the repository path (the only service-role use is
Storage-only); typecheck/lint/format/build green; the app stays deployable.

**Totals:** 125 unit/integration tests (12 new: booth + assignment machines,
booth isolation), 55 e2e (6 new booth/map tests). Migrations `0008`+`0009` applied
and the seed re-run against `nhrnkfbabzdfpxpqbhhc` — a floor plan + logo uploaded
to Storage, `files` rows created, booth A-1 confirmed for the seeded merchant.

### Deviations

| Spec / roadmap                                 | Actual                                                                        | Why                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `maps` **and** `map_floors` both surfaced      | Schema keeps both; UI manages **floors** under one auto-created map per event | Multi-floor + multi-image per event is delivered; multi-_map-set_ UI isn't needed for MVP.                   |
| Booth `x/y/width/height` (px, §8.6)            | Normalized 0..1 to the floor image                                            | Resolution-independent: the same coords render at 390px and on desktop without rescaling.                    |
| Service-role never in request paths (§ rule 5) | One narrow Storage-only exception (`media/storage.ts`)                        | Storage ≠ our Postgres schema; path is server-scoped; no `public.*` access. Documented in CLAUDE.md §6.      |
| CSV import of booths/zones (§8.14)             | Deferred                                                                      | Rides with the still-deferred `imports` pipeline.                                                            |
| Map "show my location" (§8.6)                  | Deferred (CSP already allows `geolocation=(self)`)                            | An image-based map isn't georeferenced, so a GPS dot would be misleading; lands with visitor GPS in Phase 5. |
| Map filter by category (§8.6/§8.9)             | Search + zone filter shipped; category filter deferred                        | Category names/faceting are the shared visitor-search surface — built once in Phase 5.                       |
