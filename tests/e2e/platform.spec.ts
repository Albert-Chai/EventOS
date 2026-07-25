import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 1 end-to-end: platform console, permission gating, and impersonation.
 * Needs a live Supabase project seeded with `pnpm db:seed` (which creates the
 * platform admin, the demo tenant, and its members). Skips otherwise.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";
const PASSWORD = "eventos-dev-password";
const DEMO_TENANT = "Kuala Lumpur Food Discovery Weekend";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Organizers land on /dashboard; a platform admin with no workspace is routed
  // straight to /platform. Accept either landing spot.
  await page.waitForURL(/\/(dashboard|platform)/);
  // Let any follow-on redirect settle before the test navigates again, so a
  // goto can't abort it mid-flight.
  await page.waitForLoadState("networkidle");
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
}

test.describe("Phase 1 multi-tenant", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("platform admin reaches the console and sees the seeded workspace", async ({ page }) => {
    await signIn(page, "platform.admin@eventos.test");

    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();

    await page.goto("/platform/tenants");
    await expect(page.getByText(DEMO_TENANT)).toBeVisible();

    await signOut(page);
  });

  test("an organizer owner sees their workspace but not the platform console", async ({ page }) => {
    await signIn(page, "organizer.owner@eventos.test");

    await expect(page.getByRole("heading", { name: DEMO_TENANT })).toBeVisible();
    // Owner has tenant.manage_members → the Team nav link shows.
    await expect(page.getByRole("link", { name: "Team", exact: true })).toBeVisible();

    // Not a platform admin: /platform bounces back to the dashboard.
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/dashboard/);

    await signOut(page);
  });

  test("permission gating hides and blocks what a role can't do", async ({ page }) => {
    // event_manager lacks tenant.manage_members, so Team is hidden and guarded.
    await signIn(page, "organizer.staff@eventos.test");

    await expect(page.getByRole("heading", { name: DEMO_TENANT })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);

    // Direct navigation is blocked too — hiding the link is not the control.
    await page.goto("/dashboard/team");
    await expect(page).toHaveURL(/\/dashboard$/);

    await signOut(page);
  });

  test("impersonation shows the banner and can be stopped", async ({ page }) => {
    await signIn(page, "platform.admin@eventos.test");
    await page.goto("/platform/tenants");

    // Start impersonating the seeded tenant (first row's Impersonate button).
    const row = page.getByRole("row", { name: new RegExp(DEMO_TENANT) });
    await row.getByPlaceholder("Reason (optional)").fill("e2e support check");
    await row.getByRole("button", { name: "Impersonate" }).click();

    // Lands in the dashboard, acting as the tenant, with the warning banner.
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText(/Impersonating/)).toBeVisible();
    await expect(page.getByRole("heading", { name: DEMO_TENANT })).toBeVisible();

    // Stop returns to the platform and clears the banner.
    await page.getByRole("button", { name: "Stop impersonating" }).click();
    await page.waitForURL(/\/platform/);
    await expect(page.getByText(/Impersonating/)).toHaveCount(0);

    await signOut(page);
  });
});
