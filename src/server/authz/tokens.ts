import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Opaque tokens for invitation links.
 *
 * The plaintext token is shown once, in the link; only its SHA-256 hash is
 * stored. A database leak therefore cannot be replayed as a valid invitation.
 * SHA-256 (not bcrypt) is appropriate here: the token is 256 bits of entropy,
 * so there is nothing to brute-force — no user-chosen secret to protect.
 */

export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, for callers that hold two hashes. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
