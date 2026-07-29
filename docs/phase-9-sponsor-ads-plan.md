# Phase 9 — Sponsor ad spaces

Sellable banner inventory on the visitor app: an organiser records a **sponsor**,
books a **flight** into a **slot** for a date range, uploads a creative, and gets
an impressions / clicks / CTR report.

This is distinct from the two things that already exist:

| Existing | What it is | Why it isn't this |
|---|---|---|
| **Campaigns** (Phase 8) | email/push sends to visitors | messaging, not on-site inventory |
| **Featured placements** (Phase 6) | boosting a *merchant* in the directory | promotes a participant, not an outside brand, and carries no creative |

The groundwork was already reserved: the `sponsor.manage` permission
(`authz/permissions.ts`) and the `sponsor_module` plan feature
(`billing/plans.ts`) both exist and are unused. This phase spends them.

---

## 1. Data model

Two new tenant-scoped tables. Both carry `tenant_id`, `created_at`,
`updated_at` + the `set_updated_at` trigger, and both repeat the
`REVOKE ALL … FROM anon, authenticated` (§4).

### `sponsors`

The advertiser. Tenant-scoped, not event-scoped — one sponsor can run across
several events.

`id · tenant_id · name · website_url · contact_email · logo_file_id → files ·
notes · status (active|archived) · created_by · timestamps`

### `ad_bookings`

One **flight**: this sponsor, in this slot, on this event, between these dates.

`id · tenant_id · event_id · sponsor_id · slot · creative_file_id → files ·
alt_text · click_url · starts_at · ends_at · weight · status · created_by ·
timestamps`

- **`slot`** — a code union (§ like every other status): `event_landing`,
  `directory_inline`, `merchant_detail`, `floor_plan`, `vouchers`.
- **`status`** — `draft | active | paused | archived`. Liveness is
  `status === "active"` **and** `now` inside the flight window; null dates mean
  open-ended on that side.
- **`weight`** — rotation weight when several bookings compete for one slot.
- **`click_url`** — validated `http(s)` at write time, never rendered raw into
  an `href` (see §3).

**No denormalized impression/click counters.** Phase 7's rule holds: dashboards
read **live from the raw log**, so the numbers match it by construction.

---

## 2. Selection and rotation

Two pure, unit-tested functions (the same `pure ↔ SQL` split as
`eventPhase ↔ phaseExpr`):

- `isBookingLive(booking, now)` — status + flight-window test.
- `pickWeighted(bookings, r)` — weighted choice from a `[0,1)` random, so the
  test can pin `r` and assert the distribution deterministically.

`selectAdForSlot(eventId, slot, now)` filters live bookings in SQL, then picks
in code. Returns `null` when the slot is empty — every call site renders nothing
rather than a placeholder.

---

## 3. Tracking (§25 taxonomy)

Two additive event names: **`ad_impression`**, **`ad_click`**. Names are a
contract — additive only.

Neither joins `CLIENT_TRACKABLE`. The generic public beacon must not be able to
name a booking, so each gets its own server seam that derives everything from
the **booking's own row** — the pattern CLAUDE.md already sanctions for `/q`
(`resolveScan` derives from the QR code's row):

- **Impression** — `recordAdImpression(bookingId)` server action. Loads the
  booking, confirms its event is publicly visible, and writes with
  `tenant_id`/`event_id` taken from the row. `props` carries
  `{ sponsorId, slot }`; `analytics_events` needs no new column.
- **Click** — `GET /s/[bookingId]`, a server route that records the click and
  **302s to the booking's stored `click_url`**. The destination comes from our
  database, never from the query string, so there's no open-redirect surface;
  `safeRedirectPath()` doesn't apply because the target is deliberately external.

**Known limit, deliberately accepted:** a scripted client can replay
`recordAdImpression` to inflate an impression count, exactly as it can replay
`event_viewed` today. Clicks are harder to forge (they pass through our route),
and billing is simulated, so no money moves on these numbers. If ads ever bill
for real, impressions need signing or rate limiting — noted, not built.

---

## 4. Authorization and gating

- Organiser writes: `requirePermission("sponsor.manage")` — held by `owner` and
  `admin`; **not** by `merchant_manager` or `support`.
- The whole module is a plan entitlement:
  `requirePlanFeature(tenantId, "sponsor_module")` at every create path.
- Public reads follow §1 rule 6 — they filter by public status
  (`findPublicEvent` first, then live bookings), never a membership check and
  never a client `tenant_id`.
- Creating, editing and archiving a booking is an audited state change (§23):
  `sponsor.created`, `ad_booking.created/updated/archived`. The high-volume
  impression/click writes are **not** audited — §23 is for actor state changes,
  not visitor telemetry.

---

## 5. Creative upload

Reuses the one sanctioned service-role Storage path (`§6`): `uploadImage` with a
**server-constructed** scope of `events/<eventId>/ads`, owner = the booking id,
and a new `FileKind` of `ad_creative`. The `files` row is written through the
repository layer with a scoped `tenant_id`, as always.

---

## 6. Surfaces

**Visitor** — `<AdSlot slot="…" />`, a Server Component that selects an ad and
renders the creative inside a labelled `Sponsored` frame. Placed on:

| Slot | Page |
|---|---|
| `event_landing` | event landing, under the hero |
| `directory_inline` | stall directory, after the first few cards |
| `merchant_detail` | a stall page, under the menu |
| `floor_plan` | the floor-plan bottom sheet |
| `vouchers` | the vouchers list |

Every ad is visibly labelled **Sponsored** — non-negotiable, whatever the
creative looks like.

**Organiser** — `/dashboard/events/[eventId]/sponsors`: sponsors list, booking
form (slot, creative, click URL, dates, weight), and a report table of
impressions · clicks · CTR per booking, read live from the raw log.

---

## 7. Out of scope (say so rather than half-build it)

- **Real money.** Booking has no price or invoice; billing stays simulated, as
  everywhere else in the app.
- **Impression/click caps and pacing** — the schema leaves room (`weight` is the
  only pacing lever today); auto-pause on a cap is not built.
- **Merchant self-serve buying.** The organiser sells; merchants have no ad UI.
- **Frequency capping per visitor.** Rotation is per render, not per person.
