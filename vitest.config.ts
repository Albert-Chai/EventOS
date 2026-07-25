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
