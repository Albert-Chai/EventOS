import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 2 end-to-end: the exit criteria (spec §34) — an organizer can create and
 * publish an event, the public page is generated, and draft events are not
 * publicly accessible. Needs a live Supabase project seeded with `pnpm db:seed`
 * (which creates the demo tenant and its published + draft events). Skips otherwise.
 */
const hasLiveSupabase = process.env.E2E_LIVE_SUPABASE === "true";
const PASSWORD = "eventos-dev-password";
const TENANT_SLUG = "kl-food-weekend";

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|platform)/);
  await page.waitForLoadState("networkidle");
}

test.describe("Phase 2 events", () => {
  test.skip(!hasLiveSupabase, "Needs a seeded live Supabase project (E2E_LIVE_SUPABASE=true).");

  test("a published event is public, a draft is not, and the index lists only public", async ({
    page,
  }) => {
    // The tenant's public index lists the published event, never the draft.
    await page.goto(`/${TENANT_SLUG}`);
    await expect(
      page.getByRole("heading", { name: "Kuala Lumpur Food Discovery Weekend" }),
    ).toBeVisible();
    await expect(page.getByText("KL Street Eats Weekend")).toBeVisible();
    await expect(page.getByText("Ramadan Bazaar Trial")).toHaveCount(0);

    // The published event has a public page.
    await page.goto(`/${TENANT_SLUG}/street-eats`);
    await expect(page.getByRole("heading", { name: "KL Street Eats Weekend" })).toBeVisible();
    // "Central Market" also appears inside the description, so match the venue line exactly.
    await expect(page.getByText("Central Market", { exact: true })).toBeVisible();

    // The draft is a 404 to the public — drafts are never publicly accessible.
    const draft = await page.goto(`/${TENANT_SLUG}/ramadan-bazaar-trial`);
    expect(draft?.status()).toBe(404);
  });

  test("an organizer creates and publishes an event, and it goes public", async ({ page }) => {
    // Unique per run (and per parallel project) so re-runs never collide on slug.
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const name = `E2E Launch ${suffix}`;
    const slug = `e2e-launch-${suffix}`;

    await signIn(page, "organizer.owner@eventos.test");

    await page.goto("/dashboard/events/new");
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="slug"]').fill(slug);
    await page.locator('input[name="startAt"]').fill("2026-09-01T18:00");
    await page.locator('input[name="endAt"]').fill("2026-09-03T22:00");
    await page.locator('input[name="venueName"]').fill("Test Venue");
    await page.getByRole("button", { name: "Create event" }).click();

    // Lands on the new event's overview.
    await page.waitForURL(/\/dashboard\/events\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Publish it — the publish gate is satisfied (name, dates, venue all set).
    await page.getByRole("button", { name: "Publish" }).click();
    // Once published, the "Go live" transition appears — proof the status moved.
    await expect(page.getByRole("button", { name: "Go live" })).toBeVisible();

    // The public page is now reachable.
    await page.goto(`/${TENANT_SLUG}/${slug}`);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Clean up so the seed data stays tidy across runs.
    await page.goto("/dashboard/events");
    await page.getByRole("link", { name }).click();
    await page.waitForURL(/\/dashboard\/events\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/dashboard\/events$/);
  });
});
