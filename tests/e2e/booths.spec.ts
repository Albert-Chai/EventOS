import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 end-to-end: the booths & maps exit criteria (spec §34) — an organizer
 * can create booths, a merchant is assigned and confirms, and a visitor can click
 * a booth on the public map to reach the merchant. Needs a seeded live Supabase
 * project (`pnpm db:seed`, which ships a floor plan, booths, and a confirmed
 * assignment). Skips otherwise.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";
const PASSWORD = "eventos-dev-password";
const TENANT_SLUG = "kl-food-weekend";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|platform|merchant)/);
  await page.waitForLoadState("networkidle");
}

test.describe("Phase 4 booths & maps", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a visitor can click a booth on the public map to reach the merchant", async ({ page }) => {
    // The event page surfaces the map shortcut once booths exist.
    await page.goto(`/${TENANT_SLUG}/street-eats`);
    await page.getByRole("link", { name: /View the event map/ }).click();
    await page.waitForURL(/\/street-eats\/map$/);

    // The seeded confirmed booth A-1 belongs to Nasi Lemak Bangsar — click it.
    await page.getByRole("button", { name: /Booth A-1/ }).click();
    await expect(page.getByText("Booth A-1")).toBeVisible();

    const listingLink = page.getByRole("link", { name: /View listing/ });
    await expect(listingLink).toBeVisible();
    await listingLink.click();

    await page.waitForURL(/\/nasi-lemak-bangsar$/);
    await expect(page.getByText("Nasi Lemak Ayam")).toBeVisible();
  });

  test("the deep-linked map highlights a merchant's booth", async ({ page }) => {
    // The public merchant page links to the map with ?booth=.
    await page.goto(`/${TENANT_SLUG}/street-eats/nasi-lemak-bangsar`);
    const mapLink = page.getByRole("link", { name: /find on map/i });
    await expect(mapLink).toBeVisible();
    await mapLink.click();
    await page.waitForURL(/\/map\?booth=A-1$/);
    await expect(page.getByText("Booth A-1")).toBeVisible();
  });

  test("an organizer can create a booth", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "one project mutates shared data");
    test.setTimeout(90_000);
    const boothNumber = `Z-${Date.now().toString(36).slice(-5)}`;

    await signIn(page, "organizer.owner@eventos.test");
    await page.goto("/dashboard/events");
    await page.getByRole("link", { name: "KL Street Eats Weekend" }).click();
    await page.getByRole("link", { name: "Booths", exact: true }).click();
    await page.waitForURL(/\/booths$/);

    await page.locator('input[name="boothNumber"]').fill(boothNumber);
    await page.getByRole("button", { name: "Add booth" }).click();

    await expect(page.getByText(boothNumber)).toBeVisible();
  });

  test("the merchant sees their confirmed booth in the portal", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chrome", "one read-only pass is enough");

    await signIn(page, "merchant.owner@eventos.test");
    // The merchant manages one merchant; open its listing for the seeded event.
    await page
      .getByRole("link", { name: /Nasi Lemak Bangsar/ })
      .first()
      .click();
    await page
      .getByRole("link", { name: /KL Street Eats Weekend/ })
      .first()
      .click();
    await page.waitForURL(/\/listings\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("heading", { name: "Your booth" })).toBeVisible();
    await expect(page.getByText("A-1")).toBeVisible();
    await expect(page.getByText(/Confirmed/)).toBeVisible();
  });
});
