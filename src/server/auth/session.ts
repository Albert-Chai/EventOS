import { cache } from "react";
import { headers } from "next/headers";

import {
  createContext,
  resolveRequestId,
  type AuthenticatedUser,
  type RequestContext,
} from "@/server/context";
import { REQUEST_ID_HEADER } from "@/lib/api/response";

import { createServerSupabaseClient } from "./supabase";

/**
 * Resolves the authenticated user for the current request.
 *
 * Uses `supabase.auth.getUser()`, which revalidates the JWT against the auth
 * server, rather than `getSession()`, which trusts the cookie as-is and can be
 * spoofed. This distinction is a security boundary, not a style preference.
 *
 * `cache()` deduplicates the call across a single render pass.
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
 * Builds the request context. Every Server Action, route handler, and page that
 * touches data starts here.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const headerList = await headers();
  const [requestId, user] = await Promise.all([
    Promise.resolve(resolveRequestId(headerList.get(REQUEST_ID_HEADER))),
    getCurrentUser(),
  ]);

  return createContext({ requestId, user });
});
