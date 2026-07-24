import type { Metadata } from "next";
import Link from "next/link";

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
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirectPath((await searchParams).next, "/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Create your account
        </CardTitle>
        <CardDescription>Start setting up events on {env.NEXT_PUBLIC_APP_NAME}.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <SignUpForm next={next} />
        <GoogleButton enabled={env.AUTH_GOOGLE_ENABLED} next={next} />
      </CardContent>

      <CardFooter>
        <p className="text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
