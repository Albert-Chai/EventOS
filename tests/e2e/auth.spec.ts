import { expect, test } from "@playwright/test";

/**
 * Auth flows.
 *
 * The route-guard and validation tests need no credentials and always run.
 * The full register→sign-in→sign-out journey needs a live Supabase project, so
 * it skips loudly (with a reason Playwright prints) rather than silently
 * passing when the environment is absent.
 */

const SEEDED_EMAIL = "organizer.owner@eventos.test";
const SEEDED_PASSWORD = "eventos-dev-password";

/**
 * An explicit opt-in, not a "is the variable set?" check: the build runs
 * against placeholder Supabase values, so presence proves nothing. This flag
 * asserts a real project with seeded users is reachable.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";

test.describe("route guard", () => {
  test("redirects an anonymous visitor away from the dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("preserves the intended destination through the redirect", async ({ page }) => {
    await page.goto("/dashboard/events?status=draft");
    await expect(page).toHaveURL(/next=%2Fdashboard%2Fevents/);
  });

  test("ignores an off-site next parameter", async ({ page }) => {
    // The open-redirect guard is unit-tested exhaustively; this proves it is
    // actually wired into the page rather than merely present in lib/.
    await page.goto("/sign-in?next=https://evil.example.com");

    const nextValue = await page.locator('input[name="next"]').first().inputValue();
    expect(nextValue).toBe("/dashboard");
  });
});

test.describe("sign-in page", () => {
  test("offers both password and magic-link routes", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("tab", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Email link" })).toBeVisible();

    await page.getByRole("tab", { name: "Email link" }).click();
    await expect(page.getByRole("button", { name: "Email me a link" })).toBeVisible();
  });

  test("links to sign-up and password recovery", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeVisible();
    await page.getByRole("link", { name: "Create one" }).click();
    await expect(page).toHaveURL(/\/sign-up/);
  });
});

test.describe("sign-up validation", () => {
  test("rejects a short password server-side", async ({ page }) => {
    await page.goto("/sign-up");

    // Bypass the browser's own constraint validation so the request actually
    // reaches the Server Action — client-side checks are not the boundary.
    await page.locator('input[name="displayName"]').fill("Test Organizer");
    await page.locator('input[name="email"]').fill("someone@example.test");
    await page.locator('input[name="password"]').fill("short");
    await page.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });
});

test.describe("forgot password", () => {
  test("gives the same answer for any address", async ({ page }) => {
    // User enumeration guard (spec §20): the response must not reveal whether
    // an account exists.
    await page.goto("/forgot-password");
    await page.locator('input[name="email"]').fill("definitely-not-a-user@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(/if that address has an account/i)).toBeVisible();
  });
});

test.describe("full sign-in journey", () => {
  test.skip(
    !hasLiveSupabase,
    "Needs a live Supabase project with seeded users (pnpm db:seed). Set E2E_LIVE_SUPABASE=true to run.",
  );

  test("signs in, reaches the dashboard, and signs out", async ({ page }) => {
    await page.goto("/sign-in");

    await page.locator('input[name="email"]').fill(SEEDED_EMAIL);
    await page.locator('input[name="password"]').fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    // The seeded owner lands in their workspace; the authenticated shell shows
    // the sign-out control. (Phase 1 replaced the old "Welcome" heading with the
    // workspace name.)
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");

    // The session must actually be gone, not just navigated away from.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("rejects a wrong password with a generic message", async ({ page }) => {
    await page.goto("/sign-in");

    await page.locator('input[name="email"]').fill(SEEDED_EMAIL);
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/not correct/i)).toBeVisible();
    // Must not distinguish "no such user" from "wrong password".
    await expect(page.getByText(/no account|not found|does not exist/i)).toHaveCount(0);
  });
});
