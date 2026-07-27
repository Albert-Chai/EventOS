import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RedeemForm } from "@/features/vouchers/components/redeem-form";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Redeem a voucher",
  robots: { index: false, follow: false },
};

/**
 * The organizer-side redemption screen (spec §4.x checker role). Gated by
 * `voucher.redeem` — the role that exists precisely for on-site staff who
 * validate vouchers but manage nothing else.
 */
export default async function RedeemPage() {
  await requirePermissionOrRedirect("voucher.redeem", "/dashboard/redeem");

  return (
    <div className="mx-auto grid w-full max-w-lg gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Redeem a voucher</h1>
        <p className="text-muted-foreground text-sm">
          Enter the code the visitor shows you. Each code can be redeemed once.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Voucher code
          </CardTitle>
          <CardDescription>
            Codes are 10 characters. Case doesn&apos;t matter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RedeemForm />
        </CardContent>
      </Card>
    </div>
  );
}
