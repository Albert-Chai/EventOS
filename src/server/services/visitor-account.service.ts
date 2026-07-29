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
 * What a Server Component needs to know about the reader.
 *
 * The two questions are separate and must stay separate:
 *
 *  - **Can they act?** That's "are they signed in" — this object exists.
 *  - **Which rows are theirs?** That's `visitorId`, which is legitimately null
 *    until they first favourite, claim, post, like, or comment.
 *
 * Conflating them is a real bug: a signed-in visitor who hasn't interacted yet
 * has no `visitors` row, and treating that as "logged out" sends them to
 * sign-in when they're already signed in.
 */
export type VisitorReader = {
  userId: string;
  displayName: string;
  /** Null until the lazy `visitors` row is materialised by a first action. */
  visitorId: string | null;
};

/**
 * Read-only lookup for Server Components. Never mints a cookie or a row, so
 * rendering the feed for a logged-out reader still writes nothing — and
 * rendering it for a signed-in one who has never interacted writes nothing
 * either, while still reporting them as signed in.
 */
export async function getVisitorReader(): Promise<VisitorReader | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const byUser = await findVisitorByUserId(user.id);
  if (byUser) {
    return {
      userId: user.id,
      displayName: nameFor(byUser.displayName, user.email),
      visitorId: byUser.id,
    };
  }

  // Signed in with an unclaimed cookie row — theirs in all but the link, which
  // the first write will make. Their favourites already live on it.
  const anonymousId = await readAnonymousId();
  const cookieVisitor = anonymousId ? await findVisitorByAnonymousId(anonymousId) : null;
  if (cookieVisitor && !cookieVisitor.userId) {
    return {
      userId: user.id,
      displayName: nameFor(cookieVisitor.displayName, user.email),
      visitorId: cookieVisitor.id,
    };
  }

  // Signed in, no visitor row at all. Still a reader who can post and like —
  // `resolveSignedInVisitor` creates the row when they do.
  const profile = await findProfileById(user.id);
  return {
    userId: user.id,
    displayName: nameFor(profile?.displayName ?? null, user.email),
    visitorId: null,
  };
}
