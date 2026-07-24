import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),

  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  /**
   * Architectural boundary (spec §10.2, §33.2 rule 9).
   *
   * `db` may only be imported by the repository layer. Everything else goes
   * through repositories, which is where tenant scoping is enforced from Phase 1
   * onward — a service or route reaching straight for `db` bypasses it silently.
   */
  {
    files: ["src/app/**", "src/features/**", "src/components/**", "src/server/services/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db",
              message:
                "Import a repository from @/server/db/repositories instead. Direct db access outside the repository layer bypasses tenant scoping.",
            },
          ],
        },
      ],
    },
  },

  /**
   * Health probes are the one legitimate exception: `/api/health/database`
   * must reach the connection itself, not a repository, or it would be
   * probing our own code rather than Postgres.
   */
  {
    files: ["src/app/api/health/**"],
    rules: { "no-restricted-imports": "off" },
  },

  // The logger and scripts are the intended places for raw console output.
  {
    files: ["src/server/telemetry/**", "scripts/**"],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
