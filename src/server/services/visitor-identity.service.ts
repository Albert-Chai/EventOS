import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/config/env";

/**
 * The anonymous visitor cookie (spec §8.8) — the identity shared by the visitor
 * experience (favourites/recent views) and analytics. Kept in its own module so
 * both `visitor.service` and `analytics.service` can depend on it without a cycle.
 *
 * The cookie is httpOnly and lazily minted. Minting it does **not** create a
 * `visitors` DB row — browsing still writes nothing to the database; the row is
 * created only on the first favourite/view.
 */

export const VISITOR_COOKIE = "eventos_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Returns the anonymous id, minting + setting the cookie if absent. MUST be
 * called from a Server Action or route handler that may set cookies — not a
 * Server Component render.
 */
export async function getOrSetAnonymousId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;

  const anonymousId = randomUUID();
  jar.set(VISITOR_COOKIE, anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return anonymousId;
}

/** Read-only anonymous id (never mints). Safe from any server context. */
export async function readAnonymousId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VISITOR_COOKIE)?.value ?? null;
}
