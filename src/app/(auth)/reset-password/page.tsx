import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage() {
  // The recovery link runs through /auth/callback first, which establishes the
  // session this page depends on. Landing here without one means the link
  // expired or was never followed.
  await requireUserOrRedirect("/reset-password");

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Choose a new password
        </CardTitle>
        <CardDescription>
          You&apos;ll stay signed in on this device once it&apos;s set.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
