import { createEnv } from "@t3-oss/env-nextjs";

import { clientEnvShape, serverEnvShape } from "./env-schema";

/**
 * Validated environment. Fails the build — not a request at 3am — when a
 * variable is missing or malformed (spec §33.2 rule 17).
 *
 * `createEnv` enforces the server/client boundary: anything declared under
 * `server` is unreachable from a client component, so a secret cannot be
 * accidentally imported into the browser bundle.
 *
 * The rules themselves live in `./env-schema` so they can be unit-tested
 * without triggering this validation at import time.
 */
export const env = createEnv({
  server: serverEnvShape,
  client: clientEnvShape,

  /**
   * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so client vars
   * must be destructured literally rather than read dynamically.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    AUTH_GOOGLE_ENABLED: process.env.AUTH_GOOGLE_ENABLED,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    REDIS_URL: process.env.REDIS_URL,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,

    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },

  /**
   * Lets `pnpm build` and `pnpm lint` run in CI without production secrets.
   * Never set in development, staging, or production.
   */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  emptyStringAsUndefined: true,
});

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
