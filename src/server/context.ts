import { logger, type Logger } from "@/server/telemetry/logger";
import type { Permission } from "@/server/authz/permissions";
import type { RoleKey } from "@/server/authz/roles";

/**
 * The request context is the single funnel every data access flows through.
 *
 * The rule it exists to enforce (spec §5):
 *
 *   `tenant_id` is NEVER read from a request body, query string, path
 *   parameter, or header. It is derived from the authenticated user's
 *   membership and carried in this object.
 *
 * Phase 1 fills in the fields Phase 0 reserved: `isPlatformAdmin`, the active
 * `tenant`, the caller's `permissions` within it, the list of `memberships`
 * for the switcher, and any active `impersonation`.
 */

export type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

/** A tenant the user can act in — either a real membership or one summary. */
export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
};

export type TenantContext = TenantSummary & {
  /** Role keys the member holds in this tenant (empty while impersonating). */
  roleKeys: readonly RoleKey[];
  status: string;
};

export type ImpersonationContext = {
  sessionId: string;
  tenantId: string;
  actorUserId: string;
  expiresAt: Date;
};

export type RequestContext = {
  requestId: string;
  user: AuthenticatedUser | null;
  log: Logger;

  /** True when the *real* authenticated user is a platform super-admin (§4.1). */
  isPlatformAdmin: boolean;

  /** The tenant the request is acting in, or null (no membership / not selected). */
  tenant: TenantContext | null;

  /** Effective permissions within `tenant`. Empty when there is no active tenant. */
  permissions: ReadonlySet<Permission>;

  /** Every tenant the user belongs to — powers the switcher and "no workspace" state. */
  memberships: readonly TenantSummary[];

  /** Set when this request is running inside a support impersonation session. */
  impersonation: ImpersonationContext | null;
};

/** An authenticated context. Produced by `requireUser`, never constructed directly. */
export type AuthenticatedContext = RequestContext & { user: AuthenticatedUser };

/** An authenticated context with a resolved active tenant. From `requireTenant`. */
export type TenantScopedContext = AuthenticatedContext & { tenant: TenantContext };

export function createRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** Reuses an inbound `x-request-id` so a trace survives across services. */
export function resolveRequestId(headerValue: string | null | undefined): string {
  if (typeof headerValue === "string" && /^[\w.-]{8,128}$/.test(headerValue)) {
    return headerValue;
  }
  return createRequestId();
}

export function createContext(input: {
  requestId: string;
  user: AuthenticatedUser | null;
  isPlatformAdmin?: boolean;
  tenant?: TenantContext | null;
  permissions?: ReadonlySet<Permission>;
  memberships?: readonly TenantSummary[];
  impersonation?: ImpersonationContext | null;
}): RequestContext {
  return {
    requestId: input.requestId,
    user: input.user,
    isPlatformAdmin: input.isPlatformAdmin ?? false,
    tenant: input.tenant ?? null,
    permissions: input.permissions ?? new Set(),
    memberships: input.memberships ?? [],
    impersonation: input.impersonation ?? null,
    log: logger.child({
      requestId: input.requestId,
      userId: input.user?.id ?? null,
      tenantId: input.tenant?.id ?? null,
      impersonating: Boolean(input.impersonation),
    }),
  };
}
