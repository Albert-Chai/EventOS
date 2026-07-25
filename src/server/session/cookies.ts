import { cookies } from "next/headers";

/**
 * Session-scoping cookies.
 *
 * Neither cookie is an authorization token. The active-tenant cookie only
 * *selects among tenants the user already belongs to* (re-validated against
 * membership every request), and the impersonation cookie only names a
 * server-side session row that is itself re-checked for liveness and actor
 * match. A tampered value can at worst deselect — never escalate.
 */

export const ACTIVE_TENANT_COOKIE = "eventos-tenant";
export const IMPERSONATION_COOKIE = "eventos-impersonation";

const baseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function readActiveTenantCookie(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? null;
}

export async function setActiveTenantCookie(tenantId: string): Promise<void> {
  (await cookies()).set(ACTIVE_TENANT_COOKIE, tenantId, {
    ...baseOptions,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveTenantCookie(): Promise<void> {
  (await cookies()).delete(ACTIVE_TENANT_COOKIE);
}

export async function readImpersonationCookie(): Promise<string | null> {
  return (await cookies()).get(IMPERSONATION_COOKIE)?.value ?? null;
}

export async function setImpersonationCookie(sessionId: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(IMPERSONATION_COOKIE, sessionId, { ...baseOptions, expires: expiresAt });
}

export async function clearImpersonationCookie(): Promise<void> {
  (await cookies()).delete(IMPERSONATION_COOKIE);
}
