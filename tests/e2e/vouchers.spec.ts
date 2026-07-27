import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 end-to-end (spec §34): a visitor claims a voucher and sees a code, and
 * a merchant redeems a code in the portal. Needs the seeded live Supabase project
 * (`pnpm db:seed`, which activates vouchers on the demo event and leaves
 * `SEEDNASI02` unredeemed). Skips otherwise.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";
const PASSWORD = "eventos-dev-password";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|platform|merchant)/);
  await page.waitForLoadState("networkidle");
}

test.describe("Phase 8 vouchers", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a visitor claims a voucher and gets a code", async ({ page }) => {
    await page.goto("/kl-food-weekend/street-eats/vouchers");
    await expect(page.getByRole("heading", { name: "Vouchers" })).toBeVisible();

    // The event-wide 10%-off voucher allows 2 per visitor, so a fresh browser
    // context can always claim it.
    const claim = page.getByRole("button", { name: "Claim" }).first();
    await expect(claim).toBeVisible();
    await claim.click();

    await expect(page.getByText("✓ Claimed").first()).toBeVisible({ timeout: 15_000 });

    // The claimed code also shows up on "My vouchers".
    await page.goto("/kl-food-weekend/street-eats/vouchers/mine");
    await expect(page.getByRole("heading", { name: "My vouchers" })).toBeVisible();
    await expect(page.locator("li").first()).toBeVisible();
  });

  test("the vouchers page is reachable from the event home", async ({ page }) => {
    await page.goto("/kl-food-weekend/street-eats");
    await page.getByRole("link", { name: /Vouchers/i }).first().click();
    await expect(page).toHaveURL(/\/vouchers$/);
  });

  test("a merchant redeems a code, and a second attempt is refused", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "one project mutates the seeded code");
    test.setTimeout(90_000);

    await signIn(page, "merchant.owner@eventos.test");
    await page.goto("/merchant");
    await page.getByRole("link", { name: /Nasi Lemak Bangsar/i }).first().click();
    await page.getByRole("link", { name: /Redeem a voucher/i }).click();

    await expect(page.getByRole("heading", { name: "Redeem a voucher" })).toBeVisible();
    await page.locator('input[name="code"]').fill("SEEDNASI02");
    await page.getByRole("button", { name: "Redeem" }).click();
    await expect(page.getByText(/Redeemed —/)).toBeVisible({ timeout: 15_000 });

    // The same code cannot be redeemed twice.
    await page.locator('input[name="code"]').fill("SEEDNASI02");
    await page.getByRole("button", { name: "Redeem" }).click();
    await expect(page.getByText(/already been used/i)).toBeVisible({ timeout: 15_000 });
  });
});
