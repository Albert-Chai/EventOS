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
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const validClient = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
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

  it("requires the service role key", () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...rest } = validServer;
    expect(serverSchema.safeParse(rest).success).toBe(false);
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

  it("does not expose any server secret through the client shape", () => {
    // A regression guard: adding a secret to `client` would ship it to browsers.
    const clientKeys = Object.keys(clientEnvShape);
    expect(clientKeys.every((key) => key.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect(clientKeys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientKeys).not.toContain("DATABASE_URL");
  });
});
