import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 end-to-end: the merchant onboarding exit criteria (spec §34) —
 * organizer invites a merchant, the merchant submits a listing from the portal,
 * the organizer approves it, and the approved listing appears publicly. Needs a
 * seeded live Supabase project (`pnpm db:seed`). Skips otherwise.
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

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
}

test.describe("Phase 3 merchants", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("the seeded approved merchant is public with its menu", async ({ page }) => {
    await page.goto(`/${TENANT_SLUG}/street-eats`);
    await expect(page.getByRole("heading", { name: "KL Street Eats Weekend" })).toBeVisible();

    const card = page.getByRole("link", { name: /Nasi Lemak Bangsar/ });
    await expect(card).toBeVisible();
    await card.click();

    await page.waitForURL(/\/nasi-lemak-bangsar$/);
    await expect(page.getByText("Nasi Lemak Ayam")).toBeVisible();
    await expect(page.getByText("MYR 12.00")).toBeVisible();
  });

  test("invite → claim → submit → approve → public", async ({ page }, testInfo) => {
    // The review step reads all submitted listings on the event, so run this
    // heavy round-trip on one project to avoid cross-project interference.
    test.skip(testInfo.project.name !== "mobile-chrome", "round-trip runs once");
    // Three sign-ins and ~15 navigations — well past the 30s default budget.
    test.setTimeout(150_000);

    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const merchantName = `E2E Merchant ${suffix}`;
    const merchantSlug = `e2e-merchant-${suffix}`;
    const listingTitle = `E2E Listing ${suffix}`;
    const merchantEmail = "merchant.owner@eventos.test";

    // 1. Organizer creates the merchant and sends a claim invite.
    await signIn(page, "organizer.owner@eventos.test");
    await page.goto("/dashboard/merchants/new");
    await page.locator('input[name="name"]').fill(merchantName);
    await page.locator('input[name="slug"]').fill(merchantSlug);
    await page.locator('input[name="contactEmail"]').fill(merchantEmail);
    await page.getByRole("button", { name: "Create merchant" }).click();
    await page.waitForURL(/\/dashboard\/merchants\/[0-9a-f-]{36}$/);

    await page.locator('input[name="email"]').fill(merchantEmail);
    await page.getByRole("button", { name: "Send claim invite" }).click();
    const inviteUrl = await page.locator("code").first().innerText();
    const invitePath = new URL(inviteUrl).pathname;

    // 2. Organizer adds the merchant to the published event.
    await page.goto("/dashboard/events");
    await page.getByRole("link", { name: "KL Street Eats Weekend" }).click();
    await page.getByRole("link", { name: "Manage merchants" }).click();
    await page.locator('select[name="merchantId"]').selectOption({ label: merchantName });
    await page.getByRole("button", { name: "Add to event" }).click();
    await expect(page.getByRole("link", { name: merchantName })).toBeVisible();
    await signOut(page);

    // 3. Merchant claims the invite, fills the listing + a product, and submits.
    await signIn(page, merchantEmail);
    await page.goto(invitePath);
    await page.getByRole("button", { name: "Accept and manage this merchant" }).click();
    await page.waitForURL(/\/merchant\/[0-9a-f-]{36}$/);

    await page.getByRole("link", { name: /KL Street Eats Weekend/ }).click();
    await page.waitForURL(/\/listings\/[0-9a-f-]{36}$/);
    const listingUrl = page.url();
    await page.locator('input[name="listingTitle"]').fill(listingTitle);
    await page.getByRole("button", { name: "Save listing" }).click();
    await expect(page.getByText("Listing saved.")).toBeVisible();

    await page.goto(`${listingUrl}/products`);
    await page.locator('input[name="name"]').fill("E2E Dish");
    await page.locator('input[name="price"]').fill("9.90");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Item added.")).toBeVisible();

    await page.goto(listingUrl);
    await page.waitForLoadState("networkidle");
    const submitBtn = page.getByRole("button", { name: "Submit for review" });
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click({ force: true });
    await expect(page.getByText("Submitted for review")).toBeVisible();
    await signOut(page);

    // 4. Organizer approves the submitted listing.
    await signIn(page, "organizer.owner@eventos.test");
    await page.goto("/dashboard/events");
    await page.getByRole("link", { name: "KL Street Eats Weekend" }).click();
    await page.getByRole("link", { name: "Manage merchants" }).click();

    const card = page
      .locator("div")
      .filter({ has: page.getByRole("link", { name: merchantName, exact: true }) })
      .filter({ has: page.getByRole("button", { name: "Approve" }) })
      .last();
    const approveBtn = card.getByRole("button", { name: "Approve" });
    await approveBtn.scrollIntoViewIfNeeded();
    await approveBtn.click({ force: true });
    await page.waitForLoadState("networkidle");

    // 5. The approved listing is now public — the real proof the approval landed.
    await page.goto(`/${TENANT_SLUG}/street-eats/${merchantSlug}`);
    await expect(page.getByRole("heading", { name: listingTitle })).toBeVisible();
    await expect(page.getByText("E2E Dish")).toBeVisible();

    // Clean up so re-runs stay tidy (soft-delete removes it from public reads).
    await page.goto("/dashboard/merchants");
    await page.getByRole("link", { name: merchantName }).click();
    await page.waitForURL(/\/dashboard\/merchants\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/dashboard\/merchants$/);
  });
});
