import { describe, expect, it } from "vitest";
import { z } from "zod";

import { clientEnvShape, serverEnvShape } from "@/config/env-schema";

/**
 * Exercises the validation rules directly rather than booting `createEnv`,
 * which reads `process.env` at import time and cannot be re-run per test.
 */
const serverSchema = z.object(serverEnvShape);
const clientSchema = z.object(clientEnvShape);

const validServer = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:pass@localhost:6543/postgres",
  DIRECT_DATABASE_URL: "postgresql://user:pass@localhost:5432/postgres",
  SUPABASE_SECRET_KEY: "sb_secret_AAAAAAAAAAAAAAAAAAAAAA",
};

const validClient = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_BBBBBBBBBBBBBBBBBBBBBB",
};

describe("server env", () => {
  it("accepts a minimal valid configuration", () => {
    const result = serverSchema.safeParse(validServer);
    expect(result.success).toBe(true);
  });

  it("requires both database URLs", () => {
    for (const key of ["DATABASE_URL", "DIRECT_DATABASE_URL"] as const) {
      const { [key]: _omitted, ...rest } = validServer;
      expect(serverSchema.safeParse(rest).success, `missing ${key}`).toBe(false);
    }
  });

  it("rejects a database URL that is not a postgres connection string", () => {
    const result = serverSchema.safeParse({ ...validServer, DATABASE_URL: "mysql://localhost/db" });
    expect(result.success).toBe(false);
  });

  it("requires the secret key", () => {
    const { SUPABASE_SECRET_KEY: _omitted, ...rest } = validServer;
    expect(serverSchema.safeParse(rest).success).toBe(false);
  });

  it("refuses a publishable key in the secret slot", () => {
    const result = serverSchema.safeParse({
      ...validServer,
      SUPABASE_SECRET_KEY: "sb_publishable_DDDDDDDDDDDDDDDDDDDDDD",
    });
    expect(result.success).toBe(false);
  });

  it("defaults NODE_ENV to development and rejects unknown values", () => {
    const { NODE_ENV: _omitted, ...rest } = validServer;
    expect(serverSchema.parse(rest).NODE_ENV).toBe("development");
    expect(serverSchema.safeParse({ ...validServer, NODE_ENV: "staging" }).success).toBe(false);
  });

  it("parses AUTH_GOOGLE_ENABLED into a boolean, defaulting to off", () => {
    expect(serverSchema.parse(validServer).AUTH_GOOGLE_ENABLED).toBe(false);
    expect(
      serverSchema.parse({ ...validServer, AUTH_GOOGLE_ENABLED: "true" }).AUTH_GOOGLE_ENABLED,
    ).toBe(true);
    expect(
      serverSchema.parse({ ...validServer, AUTH_GOOGLE_ENABLED: "false" }).AUTH_GOOGLE_ENABLED,
    ).toBe(false);
    // Guards against a typo silently enabling a provider that is not configured.
    expect(serverSchema.safeParse({ ...validServer, AUTH_GOOGLE_ENABLED: "yes" }).success).toBe(
      false,
    );
  });

  it("treats a blank deferred variable as unset rather than as an empty value", () => {
    const parsed = serverSchema.parse({ ...validServer, SENTRY_DSN: "", RESEND_API_KEY: "" });
    expect(parsed.SENTRY_DSN).toBeUndefined();
    expect(parsed.RESEND_API_KEY).toBeUndefined();
  });
});

describe("client env", () => {
  it("accepts a minimal valid configuration", () => {
    expect(clientSchema.safeParse(validClient).success).toBe(true);
  });

  it("rejects a malformed app URL", () => {
    expect(
      clientSchema.safeParse({ ...validClient, NEXT_PUBLIC_APP_URL: "localhost:3000" }).success,
    ).toBe(false);
  });

  it("defaults the app name and storage bucket", () => {
    const parsed = clientSchema.parse(validClient);
    expect(parsed.NEXT_PUBLIC_APP_NAME).toBe("EventOS");
    expect(parsed.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET).toBe("eventos-public");
  });

  it("refuses a secret key in the publishable slot", () => {
    // The one that actually matters: every NEXT_PUBLIC_* value is inlined into
    // the client bundle, so this mistake publishes full database access to
    // every visitor. It must fail the build, not merely be discouraged.
    const result = clientSchema.safeParse({
      ...validClient,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_CCCCCCCCCCCCCCCCCCCCCC",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/secret key/i);
    }
  });

  it("still accepts a legacy anon JWT", () => {
    // Older projects were provisioned before the sb_publishable_ format.
    const result = clientSchema.safeParse({
      ...validClient,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def",
    });
    expect(result.success).toBe(true);
  });

  it("does not expose any server secret through the client shape", () => {
    // A regression guard: adding a secret to `client` would ship it to browsers.
    const clientKeys = Object.keys(clientEnvShape);
    expect(clientKeys.every((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect(clientKeys).not.toContain("SUPABASE_SECRET_KEY");
    expect(clientKeys).not.toContain("DATABASE_URL");
  });
});
