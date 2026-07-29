import { AppError } from "@/lib/api/errors";
import { getCurrentUser } from "@/server/auth/session";
import { findProfileById } from "@/server/db/repositories/profiles.repository";
import {
  findVisitorByAnonymousId,
  findVisitorByUserId,
  insertVisitor,
  linkVisitorToUser,
} from "@/server/db/repositories/visitors.repository";
import type { Visitor } from "@/server/db/schema";

import { getOrSetAnonymousId, readAnonymousId } from "./visitor-identity.service";

/**
 * Visitor accounts (docs/phase-10-moments-plan.md §1).
 *
 * There is one identity pool — `auth.users`. A "visitor account" is simply an
 * account with no tenant membership, so signing in as a visitor reuses the
 * existing audited auth actions wholesale; nothing new is minted here and there
 * is no second password path.
 *
 * What this module owns is the **link**: `visitors.user_id`, reserved since
 * Phase 5 for exactly this. Anonymous browsing still writes nothing; a visitor
 * row only ever materialises on a favourite, a voucher claim, or (now) a post.
 */

export type VisitorAccount = {
  visitor: Visitor;
  userId: string;
  displayName: string;
};

/** Falls back to the local part of the email so a post is never bylined "null". */
function nameFor(displayName: string | null, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  return email.split("@")[0] ?? "Visitor";
}

/**
 * Resolves the signed-in visitor, creating or claiming the `visitors` row.
 *
 * Resolution order matters:
 *
 *  1. **By `user_id`** — the account is the identity, so a second device with a
 *     different cookie still resolves to the same visitor and sees its own
 *     posts. Looking the cookie up first would fork the identity per browser.
 *  2. **Claim the cookie's row** — someone who favourited a few stalls before
 *     signing up keeps them.
 *  3. **Create one** for the account.
 *
 * Server Action / route handler only: step 3 may set the cookie.
 */
export async function resolveSignedInVisitor(): Promise<VisitorAccount> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHENTICATED", { message: "Sign in to post a moment." });
  }

  const existing = await findVisitorByUserId(user.id);
  if (existing) {
    return { visitor: existing, userId: user.id, displayName: nameFor(existing.displayName, user.email) };
  }

  const profile = await findProfileById(user.id);
  const displayName = nameFor(profile?.displayName ?? null, user.email);

  const anonymousId = await getOrSetAnonymousId();
  const cookieVisitor = await findVisitorByAnonymousId(anonymousId);

  if (cookieVisitor && !cookieVisitor.userId) {
    const linked = await linkVisitorToUser(cookieVisitor.id, {
      userId: user.id,
      displayName,
      email: user.email,
    });
    // Null means another request claimed it first; the partial unique index did
    // its job, so re-read rather than fail the visitor's action.
    if (linked) return { visitor: linked, userId: user.id, displayName };
    const settled = await findVisitorByUserId(user.id);
    if (settled) return { visitor: settled, userId: user.id, displayName };
  }

  const created = await insertVisitor({
    anonymousId: cookieVisitor ? `${anonymousId}:${user.id}` : anonymousId,
    userId: user.id,
    displayName,
    email: user.email,
  });
  return { visitor: created, userId: user.id, displayName };
}

/**
 * Read-only lookup for Server Components — "is this reader signed in, and which
 * visitor are they?". Never mints a cookie or a row, so rendering the feed for a
 * logged-out reader still writes nothing.
 */
export async function getSignedInVisitorForRead(): Promise<VisitorAccount | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const byUser = await findVisitorByUserId(user.id);
  if (byUser) {
    return { visitor: byUser, userId: user.id, displayName: nameFor(byUser.displayName, user.email) };
  }

  // Signed in but never posted/favourited: known account, no visitor row yet.
  const anonymousId = await readAnonymousId();
  const cookieVisitor = anonymousId ? await findVisitorByAnonymousId(anonymousId) : null;
  if (cookieVisitor && !cookieVisitor.userId) {
    return {
      visitor: cookieVisitor,
      userId: user.id,
      displayName: nameFor(cookieVisitor.displayName, user.email),
    };
  }
  return null;
}
