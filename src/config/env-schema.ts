import { z } from "zod";

/**
 * Environment variable rules, kept separate from `env.ts` so they can be
 * imported — by tests, by tooling — without triggering the validation that
 * `createEnv` performs at module load.
 */

/**
 * Bare `z.url()` accepts `localhost:3000` — WHATWG parses it as the scheme
 * `localhost:` — which is the exact typo this check exists to catch, and which
 * would then break every `new URL(...)` built on top of it. Require http(s).
 */
const url = z.url({ protocol: /^https?$/, error: "Must be an http(s) URL." });
const nonEmpty = z.string().min(1);

/** Optional in Phase 0, required later. A blank value counts as unset. */
const optional = z
  .string()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const serverEnvShape = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // --- Database (Supabase Postgres) ----------------------------------------
  /** Pooled connection (PgBouncer, port 6543). Used by the running app. */
  DATABASE_URL: nonEmpty.startsWith("postgres"),
  /** Direct connection (port 5432). Used by migrations, which need session mode. */
  DIRECT_DATABASE_URL: nonEmpty.startsWith("postgres"),

  // --- Supabase ------------------------------------------------------------
  /** Server-side only. Bypasses every guard — never expose to the client. */
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,

  // --- Secrets -------------------------------------------------------------
  /** Guards cron and webhook endpoints. `openssl rand -base64 32`. */
  CRON_SECRET: optional,
  /** Encrypts integration credentials at rest. Phase 6+. */
  ENCRYPTION_KEY: optional,

  // --- OAuth ---------------------------------------------------------------
  // The provider itself is configured in the Supabase dashboard; this flag only
  // tells the UI whether to render the Google button, so we never show a
  // control that leads to a "provider not enabled" error.
  AUTH_GOOGLE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // --- Deferred integrations (reserved; see docs/phase-0-plan.md §2) --------
  EMAIL_PROVIDER: z.enum(["supabase", "resend", "ses"]).default("supabase"),
  RESEND_API_KEY: optional,
  EMAIL_FROM: z
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  REDIS_URL: optional,
  PAYMENT_PROVIDER: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  SENTRY_DSN: optional,
} as const;

export const clientEnvShape = {
  NEXT_PUBLIC_APP_URL: url,
  NEXT_PUBLIC_APP_NAME: nonEmpty.default("EventOS"),
  NEXT_PUBLIC_SUPABASE_URL: url,
  /** Publishable. Safe in the browser; used for auth flows only. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: nonEmpty.default("eventos-public"),
  NEXT_PUBLIC_POSTHOG_KEY: optional,
  NEXT_PUBLIC_POSTHOG_HOST: url.optional().or(z.literal("").transform(() => undefined)),
} as const;
