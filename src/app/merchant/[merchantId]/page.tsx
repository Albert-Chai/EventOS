import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ParticipationStatusBadge } from "@/features/merchants/components/participation-status-badge";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import type { ParticipationStatus } from "@/server/merchants/status";

export const metadata: Metadata = {
  title: "Merchant",
  robots: { index: false, follow: false },
};

export default async function MerchantHomePage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  const ctx = await requireMerchantMemberOrRedirect(merchantId, `/merchant/${merchantId}`);
  const participations = await listParticipationsForMerchant(merchantId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/merchant" className="text-muted-foreground text-sm hover:underline">
          ← Your merchants
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.merchant.name}</h1>
        <p className="text-muted-foreground text-sm">Your events and listings.</p>
      </div>

      {participations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No events yet
            </CardTitle>
            <CardDescription>
              An organizer will add you to an event. Once they do, it appears here and you can build
              your listing.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {participations.map((p) => (
            <li key={p.id}>
              <Link
                href={`/merchant/${merchantId}/listings/${p.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 transition-colors"
              >
                <span className="font-medium">{p.eventName}</span>
                <ParticipationStatusBadge status={p.approvalStatus as ParticipationStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
