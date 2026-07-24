import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/server/telemetry/logger";

/**
 * Redaction is a security control, not a convenience: these fields end up in
 * whatever log aggregator we point at, often with broader access than the
 * database itself.
 */
function captureLog(fn: () => void): string {
  const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
  fn();
  const output = spy.mock.calls.map((call) => String(call[0])).join("\n");
  spy.mockRestore();
  return output;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger redaction", () => {
  it("redacts obvious secret-bearing keys", () => {
    const output = captureLog(() =>
      logger.warn("test", {
        password: "hunter2",
        access_token: "eyJhbGciOi",
        authorization: "Bearer abc",
        cookie: "sb-access-token=xyz",
      }),
    );

    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("eyJhbGciOi");
    expect(output).not.toContain("Bearer abc");
    expect(output).not.toContain("sb-access-token=xyz");
    expect(output).toContain("[redacted]");
  });

  it("matches on substrings, so camelCase and prefixed variants are caught", () => {
    const output = captureLog(() =>
      logger.warn("test", {
        supabaseServiceRoleKey: "sr-secret",
        refreshToken: "rt-secret",
        stripeApiKey: "sk_live_secret",
      }),
    );

    expect(output).not.toContain("sr-secret");
    expect(output).not.toContain("rt-secret");
    expect(output).not.toContain("sk_live_secret");
  });

  it("redacts inside nested objects and arrays", () => {
    const output = captureLog(() =>
      logger.warn("test", {
        request: { headers: { authorization: "Bearer nested-secret" } },
        users: [{ email: "a@b.test", password: "nested-password" }],
      }),
    );

    expect(output).not.toContain("nested-secret");
    expect(output).not.toContain("nested-password");
    // Non-sensitive context must survive, or the logs are useless.
    expect(output).toContain("a@b.test");
  });

  it("keeps ordinary diagnostic fields intact", () => {
    const output = captureLog(() =>
      logger.warn("request.failed", { requestId: "req_123", status: 404, durationMs: 12 }),
    );

    expect(output).toContain("req_123");
    expect(output).toContain("404");
  });

  it("serialises Error objects instead of dropping them to {}", () => {
    const output = captureLog(() => logger.warn("boom", { error: new Error("kaboom") }));
    expect(output).toContain("kaboom");
  });

  it("merges child bindings into every entry", () => {
    const child = logger.child({ requestId: "req_child", tenantId: "ten_1" });
    const output = captureLog(() => child.warn("scoped"));

    expect(output).toContain("req_child");
    expect(output).toContain("ten_1");
  });
});
