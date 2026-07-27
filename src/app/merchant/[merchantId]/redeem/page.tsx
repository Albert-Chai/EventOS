import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RedeemForm } from "@/features/vouchers/components/redeem-form";
import { VoucherStatusBadge } from "@/features/vouchers/components/voucher-status-badge";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import { listMerchantVouchers } from "@/server/services/voucher.service";
import { describeDiscount } from "@/server/vouchers/status";

export const metadata: Metadata = {
  title: "Redeem a voucher",
  robots: { index: false, follow: false },
};

/**
 * The merchant validation screen (spec §34 Phase 8 "merchant validation").
 * Redemption is scoped by merchant membership: a code for another merchant's
 * voucher is refused server-side, even if staff type it in here.
 */
export default async function MerchantRedeemPage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  const ctx = await requireMerchantMemberOrRedirect(merchantId, `/merchant/${merchantId}/redeem`);

  const vouchers = await listMerchantVouchers(merchantId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link
          href={`/merchant/${merchantId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {ctx.merchant.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Redeem a voucher</h1>
        <p className="text-muted-foreground text-sm">
          Enter the code the customer shows you. Each code works once.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Voucher code
          </CardTitle>
          <CardDescription>Codes are 10 characters. Case doesn&apos;t matter.</CardDescription>
        </CardHeader>
        <CardContent>
          <RedeemForm merchantId={merchantId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Your vouchers
          </CardTitle>
          <CardDescription>
            Promotions the organizer created for your listing. Event-wide vouchers aren&apos;t listed
            here but you can still redeem them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vouchers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No merchant-specific vouchers yet.
            </p>
          ) : (
            <ul className="grid gap-2">
              {vouchers.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <span className="text-sm font-medium">{v.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">{describeDiscount(v)}</span>
                    <VoucherStatusBadge status={v.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
