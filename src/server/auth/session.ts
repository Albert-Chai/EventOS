import { cache } from "react";
import { headers } from "next/headers";

import { REQUEST_ID_HEADER } from "@/lib/api/response";
import { IMPERSONATION_PERMISSIONS, permissionsForRoles } from "@/server/authz/roles";
import type { Permission } from "@/server/authz/permissions";
import {
  createContext,
  resolveRequestId,
  type AuthenticatedUser,
  type ImpersonationContext,
  type RequestContext,
  type TenantContext,
  type TenantSummary,
} from "@/server/context";
import { findLiveImpersonation } from "@/server/db/repositories/impersonation.repository";
import {
  findMembershipWithRoles,
  listMembershipsForUser,
} from "@/server/db/repositories/members.repository";
import { isPlatformAdmin as loadIsPlatformAdmin } from "@/server/db/repositories/platform-admins.repository";
import { readActiveTenantCookie, readImpersonationCookie } from "@/server/session/cookies";

import { createServerSupabaseClient } from "./supabase";

/**
 * Resolves the authenticated user for the current request.
 *
 * Uses `getUser()`, which revalidates the JWT against the auth server, rather
 * than `getSession()`, which trusts the cookie as-is. A security boundary, not
 * a style preference.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) return null;

  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_confirmed_at),
  };
});

/**
 * Builds the full request context (spec §5). This is where the tenant, the
 * caller's permissions within it, platform-admin status, and any active
 * impersonation are resolved — once per request, `cache()`d — so no downstream
 * code ever has to ask "which tenant?" or trust a client for the answer.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const headerList = await headers();
  const requestId = resolveRequestId(headerList.get(REQUEST_ID_HEADER));

  const user = await getCurrentUser();
  if (!user) return createContext({ requestId, user: null });

  const [isPlatformAdmin, membershipRows] = await Promise.all([
    loadIsPlatformAdmin(user.id),
    listMembershipsForUser(user.id),
  ]);

  const memberships: TenantSummary[] = membershipRows.map((m) => ({
    id: m.tenantId,
    name: m.tenantName,
    slug: m.tenantSlug,
  }));

  // --- Impersonation overlay takes precedence over normal tenant selection.
  const impersonation = await resolveImpersonation(user, isPlatformAdmin);
  if (impersonation) {
    return createContext({
      requestId,
      user,
      isPlatformAdmin,
      memberships,
      tenant: impersonation.tenant,
      permissions: new Set<Permission>(IMPERSONATION_PERMISSIONS),
      impersonation: impersonation.context,
    });
  }

  // --- Normal path: active tenant from the (validated) cookie, else the first.
  const { tenant, permissions } = await resolveActiveTenant(user, membershipRows);

  return createContext({
    requestId,
    user,
    isPlatformAdmin,
    memberships,
    tenant,
    permissions,
    impersonation: null,
  });
});

async function resolveImpersonation(
  user: AuthenticatedUser,
  isPlatformAdmin: boolean,
): Promise<{ tenant: TenantContext; context: ImpersonationContext } | null> {
  if (!isPlatformAdmin) return null; // only a platform admin can impersonate

  const sessionId = await readImpersonationCookie();
  if (!sessionId) return null;

  const live = await findLiveImpersonation(sessionId, user.id, new Date());
  if (!live) return null;

  return {
    tenant: {
      id: live.session.tenantId,
      name: live.tenantName,
      slug: live.tenantSlug,
      status: live.tenantStatus,
      roleKeys: [], // acting as, not a member
    },
    context: {
      sessionId: live.session.id,
      tenantId: live.session.tenantId,
      actorUserId: user.id,
      expiresAt: live.session.expiresAt,
    },
  };
}

async function resolveActiveTenant(
  user: AuthenticatedUser,
  membershipRows: Awaited<ReturnType<typeof listMembershipsForUser>>,
): Promise<{ tenant: TenantContext | null; permissions: ReadonlySet<Permission> }> {
  if (membershipRows.length === 0) return { tenant: null, permissions: new Set() };

  const requested = await readActiveTenantCookie();
  const chosen = membershipRows.find((m) => m.tenantId === requested) ?? membershipRows[0];

  const withRoles = await findMembershipWithRoles(user.id, chosen.tenantId);
  if (!withRoles) return { tenant: null, permissions: new Set() };

  return {
    tenant: {
      id: chosen.tenantId,
      name: chosen.tenantName,
      slug: chosen.tenantSlug,
      status: chosen.tenantStatus,
      roleKeys: withRoles.roleKeys,
    },
    permissions: permissionsForRoles(withRoles.roleKeys),
  };
}
