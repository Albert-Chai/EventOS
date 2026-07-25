import { redirect } from "next/navigation";

import { AppError } from "@/lib/api/errors";
import type { Permission } from "@/server/authz/permissions";
import { getRequestContext } from "@/server/auth/session";
import type { AuthenticatedContext, RequestContext, TenantScopedContext } from "@/server/context";

/**
 * The authorization layer (spec §14).
 *
 * Every guarded operation calls one of these. The proxy redirect is a UX
 * convenience; *this* is the check that actually decides. "Never rely only on
 * hiding buttons in the frontend."
 *
 * Two families:
 *  - `require*` throw `AppError` — for route handlers and Server Actions, where a
 *    typed JSON failure is the right response.
 *  - `require*OrRedirect` redirect — for pages, where a browser navigation should
 *    land somewhere sensible, not on a JSON body.
 */

// --- Authentication --------------------------------------------------------

export async function requireUser(): Promise<AuthenticatedContext> {
  const ctx = await getRequestContext();
  if (!ctx.user) throw new AppError("UNAUTHENTICATED");
  return ctx as AuthenticatedContext;
}

export async function requireUserOrRedirect(returnTo: string): Promise<AuthenticatedContext> {
  const ctx = await getRequestContext();
  if (!ctx.user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return ctx as AuthenticatedContext;
}

// --- Active tenant ---------------------------------------------------------

export async function requireTenant(): Promise<TenantScopedContext> {
  const ctx = await requireUser();
  if (!ctx.tenant) throw new AppError("FORBIDDEN", { message: "No active organizer workspace." });
  return ctx as TenantScopedContext;
}

/**
 * For pages: sends a user with no workspace to the "no workspace yet" screen
 * rather than erroring. Distinct from unauthenticated, which goes to sign-in.
 */
export async function requireTenantOrRedirect(returnTo: string): Promise<TenantScopedContext> {
  const ctx = await requireUserOrRedirect(returnTo);
  if (!ctx.tenant) redirect("/dashboard/no-workspace");
  return ctx as TenantScopedContext;
}

/**
 * For pages: requires a tenant permission, redirecting a user who lacks it back
 * to the dashboard rather than showing a 403 body. The Server Actions those
 * pages submit to still re-check with `requirePermission` — this only decides
 * whether the page renders.
 */
export async function requirePermissionOrRedirect(
  permission: Permission,
  returnTo: string,
): Promise<TenantScopedContext> {
  const ctx = await requireTenantOrRedirect(returnTo);
  if (!ctx.permissions.has(permission)) redirect("/dashboard");
  return ctx;
}

// --- Tenant permissions ----------------------------------------------------

export function hasPermission(ctx: RequestContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Requires a permission within the active tenant. Assumes a tenant is already
 * resolved — call `requireTenant` first, or use `requireTenantPermission`.
 */
export async function requirePermission(permission: Permission): Promise<TenantScopedContext> {
  const ctx = await requireTenant();
  if (!ctx.permissions.has(permission)) {
    throw new AppError("FORBIDDEN", {
      message: "You do not have permission to perform this action.",
      details: { required: permission },
    });
  }
  return ctx;
}

// --- Platform authority ----------------------------------------------------

export async function requirePlatformAdmin(): Promise<AuthenticatedContext> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) {
    throw new AppError("FORBIDDEN", { message: "Platform administrator access required." });
  }
  return ctx;
}

export async function requirePlatformAdminOrRedirect(
  returnTo: string,
): Promise<AuthenticatedContext> {
  const ctx = await requireUserOrRedirect(returnTo);
  // A non-admin should not learn that /platform exists — 404 rather than 403.
  if (!ctx.isPlatformAdmin) redirect("/dashboard");
  return ctx;
}
