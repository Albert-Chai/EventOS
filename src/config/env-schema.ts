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
  /**
   * Server-side only. Bypasses RLS and every user-facing guard.
   * New-format `sb_secret_…`, or a legacy `service_role` JWT on older projects.
   *
   * The refinement catches the swap in the harmless direction (a publishable
   * key here just makes privileged calls fail); the one on the client side
   * catches the dangerous direction.
   */
  SUPABASE_SECRET_KEY: nonEmpty.refine(
    (value) => !value.startsWith("sb_publishable_"),
    "This is the publishable key. SUPABASE_SECRET_KEY needs the secret key (sb_secret_…).",
  ),

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
  /**
   * Publishable key (`sb_publishable_…`), or a legacy `anon` JWT. Safe in the
   * browser by design; used for auth flows only.
   *
   * The refinement is a real security control, not a formatting nicety: every
   * `NEXT_PUBLIC_*` value is inlined into the client bundle, so pasting the
   * secret key here would publish full database access to every visitor.
   * Fail the build instead.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty.refine(
    (value) => !value.startsWith("sb_secret_") && !value.startsWith("service_role"),
    "This looks like the SECRET key. It would be shipped to every browser — use the publishable key (sb_publishable_…).",
  ),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: nonEmpty.default("eventos-public"),
  NEXT_PUBLIC_POSTHOG_KEY: optional,
  NEXT_PUBLIC_POSTHOG_HOST: url.optional().or(z.literal("").transform(() => undefined)),
} as const;
