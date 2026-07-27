import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7 end-to-end (spec §34): the trackable QR redirect resolves a scanned
 * short code to its destination, and the organizer analytics dashboard renders.
 * Needs the seeded live Supabase project (`pnpm db:seed`, which creates the
 * `/q/seedmrc1` merchant code and a spread of analytics events). Skips otherwise.
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

test.describe("Phase 7 analytics", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a QR short code redirects to the merchant listing", async ({ page }) => {
    await page.goto("/q/seedmrc1");
    // 302 → the public merchant listing (destination is retargetable server-side).
    await page.waitForURL(/\/nasi-lemak-bangsar$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("an unknown QR code falls back to the app root", async ({ page }) => {
    await page.goto("/q/definitely-not-a-real-code");
    await expect(page).toHaveURL(/\/$|\/sign-in/);
  });

  test("the organizer sees an analytics dashboard for the event", async ({ page }) => {
    await signIn(page, "organizer.owner@eventos.test");
    await page.goto("/dashboard/events");
    await page.getByRole("link", { name: /Street Eats/i }).first().click();
    await page.getByRole("link", { name: "View analytics" }).click();

    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Unique visitors")).toBeVisible();
    await expect(page.getByText("Daily activity")).toBeVisible();
  });
});
