import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptMerchantInvitation } from "@/features/merchants/components/accept-merchant-invitation";
import { hashToken } from "@/server/authz/tokens";
import { findMerchantInvitationByTokenHash } from "@/server/db/repositories/merchant-members.repository";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Claim merchant",
  robots: { index: false, follow: false },
};

export default async function MerchantInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requireUserOrRedirect(`/merchant/invitations/${token}`);
  const found = await findMerchantInvitationByTokenHash(hashToken(token));

  const invalid = !found || found.invitation.status !== "pending" || found.expired;
  const mismatch =
    !invalid && ctx.user.email.toLowerCase() !== found!.invitation.email.toLowerCase();

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            {invalid ? "Invitation unavailable" : `Claim ${found!.merchant.name}`}
          </CardTitle>
          <CardDescription>
            {invalid
              ? "This invitation is invalid, already used, or has expired."
              : "Accept to manage this merchant's listings in your portal."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {invalid ? (
            <Link href="/merchant" className={buttonVariants({ variant: "outline" })}>
              Go to your portal
            </Link>
          ) : mismatch ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                This invitation was sent to {found!.invitation.email}, but you&apos;re signed in as{" "}
                {ctx.user.email}. Sign in with the invited address to accept.
              </AlertDescription>
            </Alert>
          ) : (
            <AcceptMerchantInvitation token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
