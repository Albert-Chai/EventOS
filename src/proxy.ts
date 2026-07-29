import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Refreshes the Supabase session cookie on every request and applies a coarse
 * route guard.
 *
 * Next 16 calls this file `proxy.ts` (formerly `middleware.ts`).
 *
 * The guard here is a UX redirect only. The authoritative check is
 * `requireUser()` / `requireUserOrRedirect()` server-side (spec §14) — a route
 * matcher is a routing rule, not an authorization boundary.
 *
 * Env vars are read from `process.env` rather than `@/config/env` because this
 * runs in the Edge runtime, where the validation module's Node dependencies are
 * unavailable. The values are already validated at build time.
 */

/** Route prefixes that require an authenticated user. */
const PROTECTED_PREFIXES = ["/dashboard", "/merchant", "/platform"];

/** Routes a signed-in user has no reason to see. */
const AUTH_ONLY_ROUTES = ["/sign-in", "/sign-up", "/forgot-password"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not remove: this call is what refreshes an expiring session cookie.
  // It must run before any redirect decision, or the refreshed cookie is lost.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ONLY_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    // Honour `next` rather than always dumping them on the dashboard. Someone
    // already signed in who lands here still had a destination in mind — a
    // visitor tapping "post a moment", say — and throwing it away strands them
    // somewhere they didn't ask for. Same open-redirect guard as everywhere
    // else: only a same-origin relative path is ever honoured.
    url.pathname = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/dashboard");
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation. Health endpoints
     * are excluded too: a probe must not depend on the auth service being up.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
