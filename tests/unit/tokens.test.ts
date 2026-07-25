import { describe, expect, it } from "vitest";

import { generateToken, hashToken, tokensMatch } from "@/server/authz/tokens";

describe("invitation tokens", () => {
  it("generates a token whose hash is stable and matches hashToken", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toBe(hashToken(token));
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha-256 hex
  });

  it("never stores the plaintext token in its hash", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).not.toContain(token);
  });

  it("produces distinct, high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken().token));
    expect(tokens.size).toBe(100);
    // 32 bytes base64url ≈ 43 chars.
    expect([...tokens][0].length).toBeGreaterThanOrEqual(40);
  });

  it("hashes are constant-time comparable", () => {
    const { token, tokenHash } = generateToken();
    expect(tokensMatch(hashToken(token), tokenHash)).toBe(true);
    expect(tokensMatch(hashToken(token), hashToken("different"))).toBe(false);
  });
});
