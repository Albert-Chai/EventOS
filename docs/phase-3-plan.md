# Phase 3 — Merchant Onboarding: Implementation Plan

Status: **complete** — verified against the live project 2026-07-25 (see §7)
Spec: `EventOS_PROJECT.md` §34 (Phase 3), §7.2 (merchant completes listing), §8.4
(merchants), §8.5 (`ListingItem`), §12/§13 (tables), §17 (`/merchant` routes),
§18 (merchant portal UX)

---

## 1. Scope

Bring merchants onto the platform: an organizer invites a merchant, the merchant
signs into their own portal and builds a listing (profile + products) for an
event, submits it for review, the organizer approves it, and the **approved
listing appears on the public event page** built in Phase 2.

**In scope**

- `merchants`, `merchant_members`, `merchant_invitations`, `merchant_categories`,
  `merchant_event_participations`, `listing_items`
- A **third authority axis**: merchant membership (`merchant_members`), alongside
  tenant membership and platform admin. A merchant member manages only their own
  merchant's listings; an organizer manages all merchants in their tenant.
- Merchant invitations (claim-by-email, same token pattern as team invites)
- The approval workflow: draft → submitted → approved / changes_requested /
  rejected / withdrawn, as an explicit, audited status machine
- Event-scoped product/menu items (`listing_items`)
- Organizer surfaces: a tenant merchant directory + per-event participation and
  approvals
- The merchant portal at `/merchant`
- Public: approved merchants + their items on the event page, and a public
  merchant detail page

**Out of scope** (later phases or a focused follow-up):

- **CSV import** (`imports`/`import_rows`) — deferred by decision; a fast-follow.
- **Storage image uploads** — `*_file_id` columns are reserved (logo, cover, item
  image); the Supabase Storage upload flow is a cross-cutting media pass done once
  for events + merchants + items, deferred to keep this phase shippable. Listings
  render initials/placeholders until then.
- Booths/zones/maps (Phase 4), featured placements (Phase 6 — the
  `featured_rank` column exists, management does not), reviews (Phase 5),
  merchant self-registration (the event setting exists; organizer-created
  participations only for now).

---

## 2. Decisions (from AskUserQuestion)

| #            | Decision                 | Consequence                                                                                                                                                                                                                                                            |
| ------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access model | **Full merchant portal** | Merchants authenticate and self-serve. A new `merchant_members` axis is resolved per request for `/merchant`; the merchant repositories scope by `merchant_id` derived from membership, never from the client — the same contract as tenant scoping, on a second axis. |
| Products     | **Included now**         | `listing_items` are event-scoped (per participation): name, price, promo price, dietary/halal tags, availability, display order. The portal has a products editor; the public listing shows them (subject to the event's `show_merchant_prices` setting).              |
| CSV import   | **Deferred**             | No `imports`/`import_rows` this phase. Organizers add merchants individually; bulk import is a fast-follow.                                                                                                                                                            |

---

## 3. Authorization — the merchant axis

Two ways to reach merchant data, each scoped independently:

1. **Organizer path** — a tenant member with the `merchant.*` permissions
   (already defined in Phase 1) manages every merchant in their tenant. Scoped by
   `tenant_id` from `ctx.tenant.id`, exactly like events.
2. **Merchant path** — a `merchant_members` row links a user to a merchant. A
   merchant member manages only that merchant's listings. Scoped by a
   `merchant_id` derived from the membership (`requireMerchantMember`), never from
   a request value.

Merchants have no sub-roles in Phase 3: a member can manage their merchant's
listings, full stop. The `/merchant` routes are merchant-explicit
(`/merchant/[merchantId]/...`) so a user who manages several merchants is never
ambiguous — a small, deliberate deviation from the spec's `/merchant/events/...`
sketch (§17), noted in §7.

**Approval** is the organizer's authority: `merchant.approve` / `merchant.reject`
gate the review actions. A merchant can submit and withdraw, never approve.

---

## 4. Approval status machine (`src/server/merchants/status.ts`)

Per-participation lifecycle (spec §8.4 statuses, applied to the merchant's listing
_for one event_):

```
draft ──▶ submitted ──▶ approved
  ▲           │  │
  │           │  └────▶ rejected
  └───────────┘
  (changes_requested ◀─┘, back to draft on edit)
   any active state ──▶ withdrawn
```

- **Merchant** moves `draft → submitted` (and `changes_requested`/`rejected`/
  `approved` back to `draft` by editing, and any state → `withdrawn`).
- **Organizer** moves `submitted → approved | changes_requested | rejected`
  (gated by `merchant.approve`/`merchant.reject`).
- Timestamps: `submitted_at`, `approved_at`; `reviewed_by` + `review_note` on a
  change-request/rejection so the merchant sees why.
- **Public** = `approved` AND the event is itself public (Phase 2 rules) AND the
  merchant is not suspended. Anything else is invisible publicly.

The machine is a pure, unit-tested module, like the event status machine.

---

## 5. Schema (migration 0006 generated + 0007 hand-written)

```
merchants(id, tenant_id, name, slug, registration_number, description,
          category_id→merchant_categories, contact_name, contact_email,
          contact_phone, website, logo_file_id, cover_file_id, status,
          created_by, created_at, updated_at, deleted_at)
          -- UNIQUE(tenant_id, lower(slug)) WHERE deleted_at IS NULL

merchant_members(id, merchant_id→merchants, tenant_id, user_id, status,
          invited_by, joined_at, created_at, updated_at,
          UNIQUE(merchant_id, user_id))

merchant_invitations(id, tenant_id, merchant_id→merchants, email, token_hash,
          status, invited_by, expires_at, accepted_at, accepted_user_id,
          created_at, updated_at)

merchant_categories(id, tenant_id, name, slug, sort_order, created_at, updated_at)
          -- UNIQUE(tenant_id, lower(slug))

merchant_event_participations(id, tenant_id, event_id→events, merchant_id→merchants,
          listing_title, listing_description, approval_status, participation_status,
          featured_rank, submitted_at, approved_at, reviewed_by, review_note,
          created_at, updated_at, UNIQUE(event_id, merchant_id))

listing_items(id, tenant_id, participation_id→participations, merchant_id, event_id,
          name, description, price, promo_price, currency, image_file_id,
          dietary_tags text[], is_halal, availability, display_order,
          created_at, updated_at)
```

Same-schema FKs (`tenant_id`, `event_id`, `merchant_id`, `participation_id`,
`category_id`) are in the schema files (generated). Hand-written 0007 carries the
cross-schema `auth.users` FKs (`merchant_members.user_id` CASCADE;
`invited_by`/`accepted_user_id`/`reviewed_by`/`created_by` SET NULL), the
`lower(slug)` partial unique indexes, `set_updated_at` triggers, and the
`REVOKE ALL … FROM anon, authenticated` on all six tables. 0007 is added to
`_journal.json` by hand.

---

## 6. Module order

1. Pure domain: participation status machine + merchant/category status types;
   audit actions (`merchant.*`, `participation.*`, `listing_item.*`).
2. Schema files + `index.ts`; generate 0006; hand-write 0007; read SQL; migrate.
3. Repositories: `merchants`, `merchant-members` (+ invitations),
   `merchant-categories`, `participations`, `listing-items` — each with the
   organizer (tenant-scoped) reads, the merchant (membership-scoped) reads, and
   the public reads it needs.
4. Services: `merchant`, `participation` (approval workflow), `listing-item`,
   `merchant-category` — every mutation audited; every fetch scoped.
5. Policies + session: `requireMerchantMember(merchantId)` /
   `…OrRedirect`, `listMerchantMembershipsForUser`.
6. Organizer UI: `/dashboard/merchants` (directory, categories, create/invite),
   `/dashboard/events/[eventId]/merchants` (participants + approvals).
7. Merchant portal: `/merchant`, `/merchant/[merchantId]`,
   `/merchant/[merchantId]/events/[eventId]` (listing + submit),
   `…/products`, `…/preview`, and `/merchant/invitations/[token]`.
8. Public: approved merchants on the event page + a merchant detail page
   `/[tenantSlug]/[eventSlug]/[merchantSlug]`.
9. Seed: a merchant (owned by `merchant.owner@eventos.test`), a participation in
   the published event (approved) with a couple of items, plus a pending-invite
   example.
10. Tests: unit (status machine), integration (merchant isolation, public shows
    only approved), e2e (invite → portal → submit → approve → public).
11. Migrate + seed + verify against the live project.
12. Docs + commit.

---

## 7. Exit criteria (§34) — verified against the live project 2026-07-25

- [x] **Organizer can invite a merchant** — create merchant → claim-by-email
      invite (link surfaced to share); the e2e drives it end to end
- [x] **Merchant can submit a listing** — the merchant claims the invite, signs
      into `/merchant`, edits the listing + products, and submits for review
- [x] **Organizer can approve a listing** — the review controls (gated by
      `merchant.approve`) move `submitted → approved`, audited
- [x] **Approved listing appears publicly** — the event page lists approved
      merchants and links to a public merchant detail page with the menu; the
      seed ships one approved merchant so it works out of the box

Standing bars, all met: merchant isolation proven by
`tests/integration/merchant-isolation.test.ts` (cross-tenant invisibility,
membership-scoped access, item scoping, public shows approved only); the approval
machine unit-tested; every mutation audits; typecheck/lint/format/build green.

**Totals:** 113 unit/integration tests (14 new: approval machine + merchant
isolation), 43 e2e (the full onboarding round-trip runs once on mobile). Migrations
`0006`+`0007` applied and the seed re-run against `nhrnkfbabzdfpxpqbhhc`.

### Deviations

| Planned / spec                                   | Actual                                                  | Why                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/merchant/events/...` (§17)                     | `/merchant/[merchantId]/listings/[participationId]/...` | Explicit merchant + participation in the path — unambiguous for a user who manages several merchants.      |
| `participation_status` + `approval_status` (§12) | A single `approval_status` (withdrawn folded in)        | Two overlapping state columns invite drift; one machine is the source of truth.                            |
| Image uploads                                    | `*_file_id` columns reserved; initials/placeholders     | Storage upload is cross-cutting (events + merchants + items); done once in a later media pass.             |
| Merchant self-registration                       | Organizer-created participations only                   | The event setting exists; wiring self-serve join waits (needs the setting enforced + a discovery surface). |
| CSV import                                       | Deferred (by decision)                                  | A fast-follow; `imports`/`import_rows` not created yet.                                                    |
