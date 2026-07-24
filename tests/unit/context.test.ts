import { describe, expect, it } from "vitest";

import { createRequestId, resolveRequestId } from "@/server/context";

describe("request correlation IDs", () => {
  it("generates a prefixed, unique id", () => {
    const a = createRequestId();
    const b = createRequestId();

    expect(a).toMatch(/^req_[a-f0-9]{24}$/);
    expect(a).not.toBe(b);
  });

  it("reuses a well-formed inbound id so a trace survives across services", () => {
    expect(resolveRequestId("req_abc123def456")).toBe("req_abc123def456");
    expect(resolveRequestId("01HQ8X.trace-id_9")).toBe("01HQ8X.trace-id_9");
  });

  it("generates a fresh id when the header is absent", () => {
    expect(resolveRequestId(null)).toMatch(/^req_/);
    expect(resolveRequestId(undefined)).toMatch(/^req_/);
    expect(resolveRequestId("")).toMatch(/^req_/);
  });

  it("rejects a header that could poison a log line or a response header", () => {
    // Header values are attacker-controlled and land in logs verbatim.
    expect(resolveRequestId("req_abc\r\nX-Injected: 1")).toMatch(/^req_/);
    expect(resolveRequestId("<script>alert(1)</script>")).toMatch(/^req_/);
    expect(resolveRequestId("short")).toMatch(/^req_/);
    expect(resolveRequestId("x".repeat(500))).toMatch(/^req_/);
  });
});
