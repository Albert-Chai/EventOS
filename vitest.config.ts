import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Playwright specs use their own runner; Vitest would try to execute them.
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["tests/setup/load-env.ts"],
    // Don't run test files in parallel. The integration suites each open a pooled
    // connection to the same Supabase pooler; run concurrently they contend and
    // Postgres' catalog introspection can hit statement_timeout. Serialising the
    // files removes the contention. The suite is small, so this costs a second.
    fileParallelism: false,
    // The integration suites talk to a *remote* Supabase over the transaction
    // pooler, so a single query's latency dwarfs anything a unit test does.
    // Vitest's 5s default made them flake — a different test tipping over on
    // each run — which trains you to ignore red. 30s is generous for a network
    // round trip and still fails fast on a genuine hang.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**", "src/config/**", "src/features/**"],
      exclude: ["**/*.d.ts", "src/components/ui/**"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
