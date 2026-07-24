import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/lib/api/error-codes";
import { AppError, isAppError } from "@/lib/api/errors";
import { failureBody, successBody } from "@/lib/api/response";

/**
 * The envelope is a published contract (spec §16). These assertions are
 * deliberately shape-exact: a stray or renamed key is a breaking API change,
 * not a cosmetic one.
 */
describe("API response envelope", () => {
  it("matches the success shape from spec §16", () => {
    const body = successBody({ id: "evt_1" }, { requestId: "req_123" });

    expect(body).toEqual({
      success: true,
      data: { id: "evt_1" },
      meta: { requestId: "req_123" },
    });
  });

  it("matches the error shape from spec §16", () => {
    const body = failureBody(
      "EVENT_NOT_FOUND",
      "The requested event was not found.",
      { requestId: "req_123" },
      {},
    );

    expect(body).toEqual({
      success: false,
      error: {
        code: "EVENT_NOT_FOUND",
        message: "The requested event was not found.",
        details: {},
      },
      meta: { requestId: "req_123" },
    });
  });

  it("always includes a details object, even when empty", () => {
    const body = failureBody("NOT_FOUND", "Nope.", { requestId: "req_1" });
    expect(body.error.details).toEqual({});
  });

  it("carries extra meta alongside requestId", () => {
    const body = successBody([], { requestId: "req_1", page: 2, total: 57 });
    expect(body.meta).toEqual({ requestId: "req_1", page: 2, total: 57 });
  });
});

describe("AppError", () => {
  it("resolves status and default message from the code table", () => {
    const error = new AppError("FORBIDDEN");

    expect(error.code).toBe("FORBIDDEN");
    expect(error.status).toBe(403);
    expect(error.message).toBe(ERROR_CODES.FORBIDDEN.message);
    expect(isAppError(error)).toBe(true);
  });

  it("allows overriding the message and attaching details", () => {
    const error = new AppError("PLAN_LIMIT_REACHED", {
      message: "Your Starter plan allows 50 merchants.",
      details: { limit: 50, current: 50 },
    });

    expect(error.status).toBe(402);
    expect(error.message).toBe("Your Starter plan allows 50 merchants.");
    expect(error.details).toEqual({ limit: 50, current: 50 });
  });

  it("keeps the cause off the wire — it is for logs only", () => {
    const cause = new Error("connection refused to db-primary.internal:5432");
    const error = new AppError("SERVICE_UNAVAILABLE", { cause });

    const body = failureBody(
      error.code,
      error.message,
      { requestId: "req_1" },
      error.details ?? {},
    );

    expect(JSON.stringify(body)).not.toContain("db-primary.internal");
    expect(error.cause).toBe(cause);
  });

  it("does not treat a plain Error as an AppError", () => {
    expect(isAppError(new Error("boom"))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError({ code: "FORBIDDEN" })).toBe(false);
  });
});

describe("error code table", () => {
  it("maps every code to a plausible HTTP status", () => {
    for (const [code, spec] of Object.entries(ERROR_CODES)) {
      expect(spec.status, `${code} status`).toBeGreaterThanOrEqual(400);
      expect(spec.status, `${code} status`).toBeLessThan(600);
      expect(spec.message.length, `${code} message`).toBeGreaterThan(0);
    }
  });

  it("keeps auth failures distinguishable by status", () => {
    expect(ERROR_CODES.UNAUTHENTICATED.status).toBe(401);
    expect(ERROR_CODES.FORBIDDEN.status).toBe(403);
    // Cross-tenant access is a 403, never a 404 — the caller is authenticated
    // and the resource exists; they simply do not own it.
    expect(ERROR_CODES.TENANT_MISMATCH.status).toBe(403);
  });
});
