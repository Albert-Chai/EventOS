import { expect, test } from "@playwright/test";

/**
 * Phase 5 end-to-end: the visitor experience exit criterion (spec §34) — an
 * anonymous visitor can search and filter the merchant directory, save a merchant
 * with one tap, and find it again on the favourites page. Identity is a cookie the
 * favourite action mints server-side, so no sign-in is involved. Needs the seeded
 * live Supabase project (`pnpm db:seed`); skips otherwise.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";
const TENANT_SLUG = "kl-food-weekend";
const BASE = `/${TENANT_SLUG}/street-eats`;

test.describe("Phase 5 visitor directory & favourites", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a visitor searches, filters, and favourites a merchant", async ({ page }) => {
    await page.goto(`${BASE}/merchants`);
    await expect(page.getByRole("heading", { name: "Merchants" })).toBeVisible();

    const card = page.getByRole("link", { name: /Nasi Lemak Bangsar/ });
    await expect(card).toBeVisible();

    // A filter choice is written to the URL; the seeded merchant serves halal items.
    await page.getByRole("button", { name: "Halal", exact: true }).click();
    await page.waitForURL(/[?&]halal=1/);
    await expect(card).toBeVisible();
    await page.getByRole("button", { name: "Clear all" }).click();

    // Search narrows and carries the query in the URL…
    const search = page.getByRole("searchbox", { name: "Search merchants" });
    await search.fill("nasi");
    await page.waitForURL(/[?&]q=nasi/);
    await expect(card).toBeVisible();

    // …and a no-match search shows the empty state.
    await search.fill("zzznotathing");
    await page.waitForURL(/[?&]q=zzznotathing/);
    await expect(page.getByText("No merchants found")).toBeVisible();
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(card).toBeVisible();

    // Save the merchant — the heart flips optimistically, the write lands server-side.
    await card.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Save to favourites" }).click();
    await expect(page.getByRole("button", { name: "Remove from favourites" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // The favourite persists via the cookie the action set — it shows on the list.
    await page.goto(`${BASE}/favourites`);
    await expect(page.getByRole("heading", { name: "Your favourites" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Nasi Lemak Bangsar/ })).toBeVisible();
  });
});
