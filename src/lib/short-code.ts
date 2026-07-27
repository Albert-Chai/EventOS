import { randomBytes } from "node:crypto";

/**
 * A short, URL-safe, unguessable code for `/q/{shortCode}` links (spec §8.10).
 *
 * base62 (no look-alike-free alphabet needed — these aren't hand-typed), drawn
 * from CSPRNG bytes. 8 chars ≈ 47 bits, ample for the code space while staying
 * scannable-QR small. The caller retries on the (astronomically unlikely) unique
 * collision.
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateShortCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
