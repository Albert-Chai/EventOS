"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { env } from "@/config/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createServerSupabaseClient } from "@/server/auth/supabase";
import { logger } from "@/server/telemetry/logger";

import type { AuthFormState } from "./form-state";
import {
  forgotPasswordSchema,
  magicLinkSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./schemas";

/**
 * Auth Server Actions.
 *
 * Server Actions rather than REST endpoints: they are same-origin and
 * form-driven, so Next's built-in origin check gives us CSRF protection without
 * a token dance, and the forms work before JavaScript hydrates.
 *
 * Two rules run through all of these:
 *
 *  1. Never leak whether an account exists. Sign-in and forgot-password return
 *     the same response for a wrong password, an unknown address, and an
 *     unconfirmed one (spec §20).
 *  2. Never trust the `next` parameter. It is always passed through
 *     `safeRedirectPath` (spec §20, open-redirect guard).
 */

/** Generic on purpose — see rule 1 above. */
const GENERIC_SIGN_IN_ERROR = "That email and password combination is not correct.";

function fieldErrorsFrom(error: import("zod").ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

async function absoluteUrl(path: string): Promise<string> {
  // Prefer the real request host so the flow works on preview deployments and
  // custom domains, where NEXT_PUBLIC_APP_URL is not the host being used.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : env.NEXT_PUBLIC_APP_URL;
  return new URL(path, origin).toString();
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password, displayName, next } = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // `display_name` is read by the handle_new_user() trigger.
      data: { display_name: displayName },
      emailRedirectTo: await absoluteUrl(
        `/auth/callback?next=${encodeURIComponent(safeRedirectPath(next, "/dashboard"))}`,
      ),
    },
  });

  if (error) {
    logger.warn("auth.sign_up_failed", { reason: error.message });
    // Supabase already returns an obfuscated response for existing addresses
    // when email confirmation is on; surface its message for genuine problems
    // (weak password, rate limit) without echoing anything account-specific.
    return { status: "error", message: error.message };
  }

  return {
    status: "success",
    message: "Check your inbox — we've sent a link to confirm your email address.",
  };
}

// ---------------------------------------------------------------------------
// Sign in (password)
// ---------------------------------------------------------------------------

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password, next } = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logger.warn("auth.sign_in_failed", { reason: error.message });
    return { status: "error", message: GENERIC_SIGN_IN_ERROR };
  }

  redirect(safeRedirectPath(next, "/dashboard"));
}

// ---------------------------------------------------------------------------
// Sign in (magic link)
// ---------------------------------------------------------------------------

export async function magicLinkAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, next } = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Magic links sign in existing users only; sign-up has its own flow with
      // the name field, and letting OTP create accounts would bypass it.
      shouldCreateUser: false,
      emailRedirectTo: await absoluteUrl(
        `/auth/callback?next=${encodeURIComponent(safeRedirectPath(next, "/dashboard"))}`,
      ),
    },
  });

  if (error) {
    logger.warn("auth.magic_link_failed", { reason: error.message });
  }

  // Same response either way — see rule 1.
  return {
    status: "success",
    message: "If that address has an account, a sign-in link is on its way.",
  };
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

export async function googleSignInAction(formData: FormData): Promise<void> {
  const next = safeRedirectPath(formData.get("next")?.toString(), "/dashboard");
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
  });

  if (error || !data.url) {
    logger.error("auth.google_oauth_failed", { reason: error?.message });
    redirect("/sign-in?error=oauth");
  }

  redirect(data.url);
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await absoluteUrl("/auth/callback?next=/reset-password"),
  });

  if (error) {
    logger.warn("auth.password_reset_request_failed", { reason: error.message });
  }

  // Same response either way — see rule 1.
  return {
    status: "success",
    message: "If that address has an account, a password reset link is on its way.",
  };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createServerSupabaseClient();

  // The recovery link established a session via /auth/callback. Without it
  // there is nothing to update, and an unauthenticated caller must not be able
  // to set anyone's password.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "This reset link has expired. Request a new one and try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    logger.warn("auth.password_reset_failed", { userId: user.id, reason: error.message });
    return { status: "error", message: error.message };
  }

  logger.info("auth.password_reset_succeeded", { userId: user.id });
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  // Local scope: sign out of *this* device only, not every session everywhere.
  // Signing out on one browser should not revoke your other devices — and the
  // global default would also let one session's sign-out kill another's
  // mid-request. Session-wide revocation is a separate, deliberate action.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
