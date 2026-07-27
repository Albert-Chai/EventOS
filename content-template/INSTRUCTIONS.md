# EventOS content template — how to fill it in

Fill these four CSV files with **your** content and hand them back. I'll run an
importer that wipes and rebuilds one workspace from them, so you can click through
the real visitor experience without creating anything by hand.

## How to use

1. Open each `.csv` in **Excel** or **Numbers** (double-click — they open as a
   spreadsheet with columns).
2. The files already contain a small **Penang food festival** as an example.
   **Overwrite the example rows with your own** (or keep them to preview first).
3. Keep the **header row** (row 1) exactly as-is — the importer reads it.
4. Save as **CSV** (Excel: "Save" and keep the `.csv` format if it asks).
5. Send the four files back and I'll import them.

**Rules of thumb**
- A field with a comma in it must be wrapped in "double quotes" (Excel does this
  automatically when you save).
- Leave a cell **blank** for anything optional you don't have.
- Slugs are the URL-safe id (lowercase, hyphens). They tie the sheets together —
  a menu item's `merchant_slug` must match a merchant's `merchant_slug`.
- Images aren't in this template — the UI shows clean colour placeholders. We can
  add logos/photos later.

---

## 1. `workspace-and-event.csv` — one row

The organiser workspace and its event. **One data row only.**

| Column | Required | Notes |
|---|---|---|
| `workspace_name` | ✅ | Organiser/brand name, e.g. "Penang Food Fiesta" |
| `workspace_slug` | ✅ | URL id, e.g. `penang-food-fiesta`. **Not** `kl-food-weekend` (that's the demo). |
| `event_name` | ✅ | e.g. "George Town Street Eats" |
| `event_slug` | ✅ | URL id, e.g. `street-eats` |
| `event_type` | ✅ | one of: `food_festival`, `night_market`, `expo`, `fair`, `market`, `conference`, `other` |
| `short_description` | | One line, shown on cards |
| `description` | | Full paragraph on the event page |
| `venue_name` | | e.g. "Padang Kota Lama" |
| `venue_address` | | Full address |
| `timezone` | | Defaults to `Asia/Kuala_Lumpur` |
| `start_date` | ✅ | `YYYY-MM-DD`, e.g. `2026-08-15` |
| `end_date` | ✅ | `YYYY-MM-DD` (after start) |
| `visibility` | | `public` (default), `unlisted`, or `private` |
| `primary_color` | | Hex, e.g. `#e11d48` — themes the event |
| `enable_vouchers` | | `yes`/`no` — turns on the public vouchers page |
| `enable_maps` | | `yes`/`no` — leave `no` for now (booth map comes later) |

The public site will be at **`/{workspace_slug}/{event_slug}`**.

---

## 2. `merchants.csv` — one row per merchant/stall

| Column | Required | Notes |
|---|---|---|
| `merchant_slug` | ✅ | URL id, unique. Referenced by menu items + vouchers. |
| `merchant_name` | ✅ | Display name |
| `category` | | Free text, e.g. "Malay", "Drinks". Becomes a directory filter — reuse the same spelling to group them. |
| `description` | | Shown on the merchant page |
| `contact_email` | | |
| `contact_phone` | | |
| `website` | | Full URL |
| `zone` | | Free text, e.g. "Zone A". Becomes a directory filter. |
| `featured` | | `yes`/`no` — featured merchants are boosted + badged |
| `listing_title` | | Optional override of how the stall reads at this event (defaults to the name) |
| `listing_description` | | Optional event-specific blurb |

Every merchant is imported as **approved**, so it shows publicly right away.

---

## 3. `menu-items.csv` — one row per item

| Column | Required | Notes |
|---|---|---|
| `merchant_slug` | ✅ | Must match a `merchant_slug` in `merchants.csv` |
| `item_name` | ✅ | |
| `description` | | |
| `price` | | Number, e.g. `12.00` (in the item's currency). Blank = no price shown. |
| `promo_price` | | Optional sale price, e.g. `18.00` |
| `currency` | | Defaults to `MYR` |
| `dietary_tags` | | **Semicolon**-separated, e.g. `spicy;contains nuts` |
| `is_halal` | | `yes`/`no` |
| `availability` | | `available` (default), `sold_out`, or `hidden` |
| `display_order` | | Number — lower shows first |

---

## 4. `vouchers.csv` — one row per voucher (optional)

Leave this file with just its header row if you don't want vouchers. Needs
`enable_vouchers` = `yes` in sheet 1 to be visible.

| Column | Required | Notes |
|---|---|---|
| `merchant_slug` | | Blank = event-wide voucher. Otherwise must match a merchant. |
| `title` | ✅ | e.g. "Opening Day 20% Off" |
| `description` | | |
| `terms` | | Fine print |
| `type` | ✅ | `discount_percent`, `discount_amount`, `freebie`, `bogo`, or `bundle` |
| `discount_percent` | | Number `1`–`100` — **only** for `discount_percent` |
| `discount_amount` | | Money amount, e.g. `3.00` — **only** for `discount_amount` |
| `min_spend` | | Money amount required to use it, e.g. `12.00` |
| `total_quantity` | | Whole number; **blank = unlimited** |
| `per_visitor_limit` | | Whole number (default `1`) |
| `starts_date` | | `YYYY-MM-DD` |
| `ends_date` | | `YYYY-MM-DD` |
| `status` | | `active` (default), `scheduled`, `draft`, `paused` |

---

## What you'll be able to see after import

- `/{workspace_slug}/{event_slug}` — the event page
- `…/merchants` — searchable directory (your categories + zones as filters)
- `…/{merchant_slug}` — a merchant page with its menu
- `…/vouchers` → claim → `…/vouchers/mine` (code + QR)
- Sign in as `organizer.owner@eventos.test` (password `eventos-dev-password`) to
  see the same content in the **dashboard**.

Re-running the import **replaces that workspace entirely** with the latest CSVs —
so iterate freely.
