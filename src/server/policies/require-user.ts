import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import { getRequestContext } from "@/server/auth/session";
import type { AuthenticatedContext } from "@/server/context";

/**
 * The authorization layer (spec §14).
 *
 * Every guarded operation calls one of these. The middleware redirect is a UX
 * convenience; *this* is the check that actually decides. "Never rely only on
 * hiding buttons in the frontend."
 *
 * Phase 1 adds `requireTenant(ctx)` and `requirePermission(ctx, 'event.publish')`
 * alongside these, following the same shape.
 */

/** Throws `AppError(UNAUTHENTICATED)`. For route handlers and Server Actions. */
export async function requireUser(): Promise<AuthenticatedContext> {
  const ctx = await getRequestContext();
  if (!ctx.user) {
    throw new AppError("UNAUTHENTICATED");
  }
  return ctx as AuthenticatedContext;
}

/**
 * Redirects to sign-in instead of throwing. For pages, where a 401 JSON body
 * would be the wrong response to a browser navigation.
 */
export async function requireUserOrRedirect(returnTo: string): Promise<AuthenticatedContext> {
  const ctx = await getRequestContext();
  if (!ctx.user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  }
  return ctx as AuthenticatedContext;
}
