# Phase 8 — Vouchers and Campaigns: Implementation Plan

Status: **complete** (migrations 0016/0017 applied + verified live; typecheck +
lint + 216 unit/integration tests + production build green)
Spec: `EventOS_PROJECT.md` §34 (Phase 8), §8.8 (visitor features / saved
vouchers), §8.12 (notifications), §14 (`voucher.manage`, `voucher.redeem`,
`campaign.manage`), §17 (`/vouchers` public route), §22 (voucher + send usage
metrics), §25 (`voucher_viewed` / `voucher_claimed` / `voucher_redeemed`), §12
(`vouchers`, `voucher_codes`, `voucher_claims`, `voucher_redemptions`,
`campaigns`, `campaign_audiences`, `campaign_messages`,
`notification_deliveries`).

---

## 1. Scope

The last build phase: promotions a visitor can claim and a merchant can redeem,
plus campaigns an organizer can send and measure.

- **Vouchers** an organizer creates per event (optionally scoped to one merchant),
  with a status lifecycle, a claim window, a total quantity and a per-visitor
  limit.
- **Claims** by anonymous visitors — each claim mints a **unique code** the
  visitor can show as text or a scannable QR (reusing the Phase 7 renderer).
- **Redemption** by the merchant (or an organizer-side checker): paste/enter the
  code, the server validates it, and one redemption is recorded per code.
- **Campaigns** (email / web push / in-app) with an audience, message content,
  a send that records **per-recipient deliveries**, and **campaign reporting**.
- Wires the metering, analytics and audit hooks earlier phases reserved for this
  one.

Meets the three §34 exit criteria: visitor can claim a voucher · merchant can
redeem a voucher · organizer can see campaign performance.

---

## 2. Decisions (from AskUserQuestion)

| Question       | Choice                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery       | **Simulated delivery, defer providers.** A campaign send transitions `queued → sending → sent` and writes a `notification_deliveries` row per recipient, but nothing leaves the building. Supabase's built-in email was evaluated and **rejected**: it is auth-transactional only (confirm/magic-link/reset/invite), hard rate-limited, and the only way to make it send arbitrary mail is to abuse `inviteUserByEmail`/`generateLink`, which creates accounts and mails auth links. Real sending is a single adapter behind the `EmailProvider` seam — `EMAIL_PROVIDER` (`supabase｜resend｜ses`) and `RESEND_API_KEY` are already reserved in `env-schema.ts`. Mirrors the Phase 6 simulated-billing precedent. |
| Voucher codes  | **Unique code issued per claim.** A claim mints a `voucher_codes` row (globally unique short code, base62 via the Phase 7 `generateShortCode`) bound to the `voucher_claims` row. Gives per-visitor traceability, a QR-able code, and a natural one-redemption-per-code constraint (`unique(voucher_code_id)` on redemptions). |
| Redemption     | **Enter/paste the code in the merchant portal.** A redemption screen for merchant members, plus an organizer-side one for the `voucher.redeem` (checker) role. The visitor sees the code as text **and** as a QR rendered with the Phase 7 `qrcode` dependency. No new dependency; camera scanning is a documented follow-up. |

---

## 3. Domain modules (code, pure, unit-tested)

**`src/server/vouchers/status.ts`**

- `VOUCHER_STATUSES` — `draft｜scheduled｜active｜paused｜expired｜archived`, with
  `VOUCHER_TRANSITIONS` and `canTransitionVoucher(from, to)` (the Phase 2 event
  machine shape).
- `VOUCHER_TYPES` — `discount_percent｜discount_amount｜freebie｜bogo｜bundle`.
- `VOUCHER_CODE_STATUSES` — `issued｜redeemed｜void｜expired`.
- `isClaimable(voucher, now)` — the single predicate the public surface and the
  claim service share: status `active`, inside `[starts_at, ends_at)`, and
  quantity remaining. Never duplicated in a component.
- `describeDiscount(voucher)` — the human label ("20% off", "RM5 off").

**`src/server/campaigns/status.ts`**

- `CAMPAIGN_STATUSES` — `draft｜scheduled｜sending｜sent｜paused｜cancelled｜failed`
  + transitions.
- `CAMPAIGN_CHANNELS` — `email｜push｜in_app`.
- `AUDIENCE_TYPES` — `all_visitors｜favourited_merchant｜claimed_voucher｜recent_visitors`.
- `DELIVERY_STATUSES` — `queued｜sent｜delivered｜failed｜bounced｜opened｜clicked`.

---

## 4. Schema (migration 0016 generated + 0017 hand-written)

All tenant-scoped; all repeat the `REVOKE ALL … FROM anon, authenticated`.

- **`vouchers`** — tenant + event scoped, `merchant_id` **nullable** (null = an
  event-wide voucher; set = merchant-specific). `title`, `description`, `terms`,
  `voucher_type`, `discount_percent`, `discount_amount_cents`, `currency`,
  `min_spend_cents`, `image_file_id`, `status`, `starts_at`, `ends_at`,
  `total_quantity` (null = unlimited), `per_visitor_limit` (default 1),
  `claimed_count`, `redeemed_count`, `created_by`, timestamps, `deleted_at`.
- **`voucher_codes`** — one row per claim. `code` **globally unique**, `status`,
  `issued_at`, `expires_at`.
- **`voucher_claims`** — `voucher_id`, `visitor_id`, `voucher_code_id` (unique),
  `event_id`, `status`, `claimed_at`. Indexed `(voucher_id, visitor_id)` for the
  per-visitor-limit count.
- **`voucher_redemptions`** — `voucher_code_id` **unique** (one redemption per
  code — the constraint that makes double-spend impossible at the database
  level), `claim_id`, `voucher_id`, `event_id`, `merchant_id`, `visitor_id`,
  `redeemed_by_user_id` (→ `auth.users`, hand-written), `redeemed_by_merchant_id`,
  `amount_cents`, `notes`, `redeemed_at`. **Append-only** (no trigger).
- **`campaigns`** — tenant + event scoped. `name`, `description`, `channel`,
  `status`, `scheduled_at`, `sent_at`, `recipient_count`, `sent_count`,
  `failed_count`, `created_by`, timestamps.
- **`campaign_audiences`** — `campaign_id`, `audience_type`, `filter_json`,
  `estimated_size`.
- **`campaign_messages`** — `campaign_id`, `channel`, `subject`, `body`,
  `preview_text`, timestamps. The rendered content per channel.
- **`notification_deliveries`** — `campaign_id` (nullable, so transactional
  notifications can reuse it later), `message_id`, `visitor_id`, `channel`,
  `status`, `error`, `queued_at`, `sent_at`, `opened_at`, `clicked_at`.
  **Append-mostly**; carries a trigger since status advances.

The three unique constraints (`voucher_codes.code`,
`voucher_claims.voucher_code_id`, `voucher_redemptions.voucher_code_id`) are
plain table constraints in the generated migration — stronger and simpler than
the partial indexes earlier phases needed, because none of them is conditional.

0017 (hand-written): `vouchers.created_by`,
`voucher_redemptions.redeemed_by_user_id` and `campaigns.created_by` →
`auth.users` (SET NULL) FKs; a partial index on active, non-deleted vouchers for
the public list; `set_updated_at` triggers on the seven mutable tables (not
append-only `voucher_redemptions`); and `REVOKE ALL … FROM anon, authenticated`
on all eight. `_journal.json` gets idx 16 + 17.

---

## 5. Claiming, and why it is transactional

`claimVoucher` runs in a **transaction that locks the voucher row**
(`SELECT … FOR UPDATE`) before counting. Without the lock, two concurrent claims
both read `claimed_count = total_quantity - 1` and both succeed — over-issuing a
limited voucher. Inside the lock: re-check `isClaimable`, count this visitor's
existing claims against `per_visitor_limit`, mint the code, insert
claim + code, bump `claimed_count`. New error codes
`VOUCHER_NOT_CLAIMABLE` (409), `VOUCHER_LIMIT_REACHED` (409),
`VOUCHER_SOLD_OUT` (409).

`redeemVoucher` is the mirror: resolve the code, validate (exists, `issued`, not
expired, the redeemer's event/merchant matches), insert the redemption — with
`unique(voucher_code_id)` as the last line of defence against a double redeem —
flip the code to `redeemed`, bump `redeemed_count`. `VOUCHER_CODE_NOT_FOUND`
(404), `VOUCHER_ALREADY_REDEEMED` (409).

The public claim path follows the §1/§6 seam exactly like Phase 5/7: the tenant
and event come from the **URL slug** via `findPublicEvent`, the visitor from the
`eventos_vid` cookie — never a client value.

---

## 6. Campaigns + the delivery seam

- `sendCampaign` resolves the audience to visitor rows (via a repository query
  per `audience_type`), writes one `notification_deliveries` row per recipient,
  and asks the **provider seam** to deliver each.
- `src/server/notifications/provider.ts` exports `getEmailProvider()` returning a
  `{ name, send(message) }`. Phase 8 ships the **`simulated`** provider (records
  the send, logs, never contacts the network). A `resend` adapter is a
  documented follow-up gated on `RESEND_API_KEY`; `web-push` likewise on VAPID
  keys. Because delivery is simulated, `sent_count` reflects recorded deliveries
  — labelled as such in the UI so no one mistakes it for real inbox delivery.
- **Campaign reporting** (the §34 exit criterion) aggregates
  `notification_deliveries` by status for the campaign, plus the derived rates.

---

## 7. Cross-cutting wiring (the hooks earlier phases reserved)

- **Plan gating** — `requirePlanFeature(tenantId, "vouchers")` on voucher create,
  `"campaigns"` on campaign create (both entitlements already exist).
- **Usage ledger** — `recordUsage` finally increments the metrics Phase 6 defined
  but had nothing to write them: `voucher_claims`, `voucher_redemptions`,
  `email_sends` / `push_sends` (per delivery).
- **Analytics** — emits `voucher_viewed`, `voucher_claimed`, `voucher_redeemed`,
  the §25 names Phase 7 defined ahead of use.
- **Audit** — new actions `voucher.created`, `voucher.updated`,
  `voucher.status_changed`, `voucher.redeemed`, `campaign.created`,
  `campaign.scheduled`, `campaign.sent`. (Visitor *claims* are not audited — §23
  audits actor state-changes, not visitor telemetry; the claim is captured in
  analytics + the ledger.)
- **Event settings** — `enable_vouchers` (already in `event_settings`, default
  false) gates the public voucher surface, like `enable_favourites` does.

---

## 8. Surfaces

- **Organizer** — `/dashboard/events/[eventId]/vouchers` (list + create + status
  controls, `voucher.manage`), `/dashboard/events/[eventId]/campaigns` (list +
  create + send + per-campaign report, `campaign.manage`),
  `/dashboard/redeem` (the `voucher.redeem` checker screen).
- **Merchant** — `/merchant/[merchantId]/vouchers` (vouchers on their listings)
  and `/merchant/[merchantId]/redeem` (the validation screen).
- **Public** — `/{tenant}/{event}/vouchers` (claimable list + claim button, gated
  by `enable_vouchers`) and `/{tenant}/{event}/vouchers/mine` (claimed codes with
  QR). Both mobile-first at 390px.

---

## 9. Module order

1. Domain: `vouchers/status.ts`, `campaigns/status.ts`; error codes; audit
   actions.
2. Schema + barrel; generate 0016; hand-write 0017; read the SQL; migrate.
3. Repositories (8) incl. the locking claim query + audience resolution.
4. Services: `voucher.service`, `campaign.service`, notification provider seam.
5. Actions + UI: organizer, merchant, public.
6. Seed: 2 vouchers, a few claims + one redemption, one sent campaign with
   deliveries.
7. Tests: unit (status machines, `isClaimable`, discount labels), integration
   (claim limits, sold-out, double-redeem, tenant isolation, campaign report),
   e2e (claim → redeem).
8. Verify + build live; docs + `CLAUDE.md` + memory; commit to main.

---

## 10. Exit criteria (§34)

- [x] **Visitor can claim voucher** — public `/{tenant}/{event}/vouchers` → claim
      → a unique code, shown as text + QR on `/vouchers/mine`. Limits and the
      claim window are enforced inside the locking transaction
      (`claimVoucherTx`), integration-tested including 4 concurrent claims on a
      1-quantity voucher (exactly one wins).
- [x] **Merchant can redeem voucher** — `/merchant/[id]/redeem` (and the
      organizer `voucher.redeem` checker screen at `/dashboard/redeem`) validates
      scope, expiry and prior use, then records exactly one redemption per code —
      the second attempt is rejected by `unique(voucher_code_id)`, proven by test.
- [x] **Organizer can see campaign performance** —
      `/dashboard/events/[id]/campaigns` shows recipients, delivered, delivery
      rate, opened and failed per campaign, from `notification_deliveries`.

Standing bars, all met: isolation of vouchers/claims/campaigns proven by
`tests/integration/vouchers.test.ts`; status machines, claimability and report
maths unit-covered by `tests/unit/vouchers.test.ts`; e2e `vouchers.spec.ts`
(claim → redeem → double-redeem refused); typecheck / lint / 216 tests /
production build green; deployable.

### Planned deviations

| Spec                                    | Actual                                                                | Why                                                                            |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Email + web push delivery (§8.12, §34)  | Simulated behind an `EmailProvider` seam; deliveries recorded          | No provider/VAPID configured; Supabase email is auth-only. One adapter to swap. |
| Camera QR scanning for redemption       | Paste/enter the code (visitor sees code + QR)                         | Avoids a browser QR-decode dependency; the fallback path is needed regardless.  |
| SMS / WhatsApp channels (§8.12)         | Deferred; `email｜push｜in_app` ship                                    | Paid add-on, no provider; the channel union is additive.                        |
| Passport challenges (§8.8, `enable_passport`) | Deferred                                                        | A separate module, not a §34 Phase 8 deliverable.                               |
| Visitor notification preferences (§8.8) | Deferred with the visitor account (still anonymous-cookie identity)   | Needs registered visitor accounts, which remain deferred.                       |
