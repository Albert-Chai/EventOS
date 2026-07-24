import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/config/env";
import { GoogleButton } from "@/features/auth/components/google-button";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

const CALLBACK_ERRORS: Record<string, string> = {
  link_invalid: "That link has expired or has already been used. Please request a new one.",
  oauth: "We couldn't complete the Google sign-in. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "/dashboard");
  const errorMessage = params.error ? CALLBACK_ERRORS[params.error] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Sign in
        </CardTitle>
        <CardDescription>
          Access your {env.NEXT_PUBLIC_APP_NAME} organizer workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {errorMessage ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <SignInForm next={next} />
        <GoogleButton enabled={env.AUTH_GOOGLE_ENABLED} next={next} />
      </CardContent>

      <CardFooter>
        <p className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
