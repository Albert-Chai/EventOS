import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/config/env";
import { AcceptInvitation } from "@/features/team/components/accept-invitation";
import { ROLE_OPTIONS } from "@/features/team/components/role-options";
import { hashToken } from "@/server/authz/tokens";
import { getCurrentUser } from "@/server/auth/session";
import { findInvitationByTokenHash } from "@/server/db/repositories/invitations.repository";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="p-4 sm:p-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {env.NEXT_PUBLIC_APP_NAME}
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findInvitationByTokenHash(hashToken(token));

  if (!found) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle as="h1" className="text-xl">
              Invitation not found
            </CardTitle>
            <CardDescription>This link is invalid or has already been used.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const { invitation, tenantName, expired } = found;
  const roleNames = invitation.roleKeys.map(
    (key) => ROLE_OPTIONS.find((r) => r.key === key)?.name ?? key,
  );

  const isUsable = invitation.status === "pending" && !expired;

  const stateMessage =
    invitation.status === "accepted"
      ? "This invitation has already been accepted."
      : invitation.status === "revoked"
        ? "This invitation was revoked."
        : expired
          ? "This invitation has expired. Ask for a new one."
          : null;

  const user = await getCurrentUser();
  const emailMatches = user && user.email.toLowerCase() === invitation.email.toLowerCase();
  const nextParam = `/invitations/${token}`;

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            Join {tenantName}
          </CardTitle>
          <CardDescription>
            You&apos;ve been invited to {tenantName} as {roleNames.join(", ")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {stateMessage ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{stateMessage}</AlertDescription>
            </Alert>
          ) : !user ? (
            <>
              <p className="text-muted-foreground text-sm">
                Sign in as <strong>{invitation.email}</strong> to accept.
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/sign-in?next=${encodeURIComponent(nextParam)}`}
                  className={buttonVariants({ className: "flex-1" })}
                >
                  Sign in
                </Link>
                <Link
                  href={`/sign-up?next=${encodeURIComponent(nextParam)}`}
                  className={buttonVariants({ variant: "outline", className: "flex-1" })}
                >
                  Create account
                </Link>
              </div>
            </>
          ) : !emailMatches ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                This invitation was sent to {invitation.email}, but you&apos;re signed in as{" "}
                {user.email}. Sign in with the invited account to accept.
              </AlertDescription>
            </Alert>
          ) : isUsable ? (
            <AcceptInvitation token={token} />
          ) : null}
        </CardContent>
      </Card>
    </Shell>
  );
}
