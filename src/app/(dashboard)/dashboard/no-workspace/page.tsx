import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "No workspace yet",
  robots: { index: false, follow: false },
};

/**
 * Shown to an authenticated user who belongs to no tenant. In Phase 1 workspaces
 * are created by the platform admin (per the onboarding decision), so the action
 * here is to wait for an invitation rather than to self-serve.
 */
export default async function NoWorkspacePage() {
  const ctx = await requireUserOrRedirect("/dashboard/no-workspace");

  // If they *do* have a workspace, this page is not for them.
  if (ctx.tenant) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            You&apos;re signed in — no workspace yet
          </CardTitle>
          <CardDescription>
            Your account ({ctx.user.email}) isn&apos;t part of an organizer workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground grid gap-3 text-sm">
          <p>
            EventOS workspaces are set up by the platform team. Once you&apos;re invited, the
            invitation link will bring you straight in — or a workspace you&apos;re added to will
            appear here automatically.
          </p>
          <p>If you were expecting access, check your email for an invitation.</p>
        </CardContent>
      </Card>
    </div>
  );
}
