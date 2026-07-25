import { config } from "dotenv";

/**
 * Vitest setup. Loads local env so integration tests can reach the database.
 *
 * When no database is configured (CI without secrets), we set
 * SKIP_ENV_VALIDATION so that importing modules which touch `@/config/env`
 * doesn't throw at load time — the integration suites then skip themselves via
 * `describe.skipIf(!process.env.DIRECT_DATABASE_URL)`. Pure unit tests don't
 * import that module and are unaffected either way.
 */
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

if (!process.env.DIRECT_DATABASE_URL) {
  process.env.SKIP_ENV_VALIDATION = "true";
}
