import { logger, type Logger } from "@/server/telemetry/logger";

/**
 * The request context is the single funnel every data access flows through.
 *
 * Phase 0 populates only `requestId` and `user`. Phase 1 adds `tenant` and
 * `permissions` here — and *only* here — so no call site has to change when
 * multi-tenancy lands.
 *
 * The rule this type exists to enforce (spec §5):
 *
 *   `tenant_id` is NEVER read from a request body, query string, path
 *   parameter, or header. It is derived from the authenticated user's
 *   membership and carried in this object.
 */

export type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
};

export type RequestContext = {
  requestId: string;
  user: AuthenticatedUser | null;
  log: Logger;

  // --- Phase 1 -------------------------------------------------------------
  // tenant: TenantContext | null
  // permissions: ReadonlySet<Permission>
  // isPlatformAdmin: boolean
};

/** An authenticated context. Produced by `requireUser`, never constructed directly. */
export type AuthenticatedContext = RequestContext & { user: AuthenticatedUser };

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
}): RequestContext {
  return {
    requestId: input.requestId,
    user: input.user,
    log: logger.child({ requestId: input.requestId, userId: input.user?.id ?? null }),
  };
}
