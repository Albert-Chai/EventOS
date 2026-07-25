import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 end-to-end: the monetization exit criteria (spec §34) — an organizer
 * can upgrade their plan (simulated) and see the invoice, and a featured merchant
 * is visibly boosted on the public directory. Needs the seeded live Supabase
 * project (`pnpm db:seed`, which puts the demo tenant on Growth and features the
 * seeded merchant). Skips otherwise.
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

test.describe("Phase 6 monetization", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a featured merchant shows a badge on the public directory", async ({ page }) => {
    await page.goto("/kl-food-weekend/street-eats/merchants");
    await expect(page.getByRole("heading", { name: "Merchants" })).toBeVisible();
    // The seeded merchant is featured.
    await expect(page.getByText("★ Featured").first()).toBeVisible();
  });

  test("an organizer upgrades the plan and gets an invoice", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "one project mutates shared billing state");
    test.setTimeout(90_000);

    await signIn(page, "organizer.owner@eventos.test");
    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();

    // The seed starts the tenant on Growth; switch up to Professional (simulated).
    await page.getByRole("button", { name: "Switch to Professional" }).click();

    // The current-plan card reflects the new plan…
    await expect(page.getByText("Professional plan")).toBeVisible();
    // …and a paid invoice is recorded.
    await expect(page.getByText("paid").first()).toBeVisible();
  });
});
