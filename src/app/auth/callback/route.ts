import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/safe-redirect";
import { createServerSupabaseClient } from "@/server/auth/supabase";
import { logger } from "@/server/telemetry/logger";

/**
 * Single landing point for every email/OAuth return: sign-up confirmation,
 * magic link, Google OAuth, and password recovery.
 *
 * Exchanges the PKCE code for a session, sets the cookies, then redirects to a
 * validated relative path. `next` is attacker-influencable (it rides through an
 * email link), so it never reaches `redirect()` unvalidated.
 *
 * Not wrapped in `withApi`: this returns redirects to a browser, not a JSON
 * envelope, and it must work while the user is still unauthenticated.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  // Supabase reports failures (expired link, already-used token) on the query
  // string rather than by omitting the code.
  const errorCode = searchParams.get("error") ?? searchParams.get("error_code");
  if (errorCode) {
    logger.warn("auth.callback_provider_error", {
      error: errorCode,
      description: searchParams.get("error_description"),
    });
    return NextResponse.redirect(new URL("/sign-in?error=link_invalid", origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=link_invalid", origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn("auth.callback_exchange_failed", { reason: error.message });
    return NextResponse.redirect(new URL("/sign-in?error=link_invalid", origin));
  }

  logger.info("auth.callback_succeeded", { next });
  return NextResponse.redirect(new URL(next, origin));
}
