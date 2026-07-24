import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs on a dedicated port, not 3000. Sharing the dev-server port means
 * `reuseExistingServer` will happily attach to whatever else is listening —
 * including an unrelated project — and the suite then tests the wrong app.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A `.only` left in a spec silently shrinks the suite; fail the CI run instead.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Mobile first (spec §3.2) — the visitor experience is primarily phones,
    // so the phone viewport runs first and is never the afterthought project.
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${port}`,
        url: baseURL,
        // Always start our own: never inherit a stranger's server.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
