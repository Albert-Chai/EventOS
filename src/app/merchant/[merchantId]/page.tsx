import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MerchantBrandForm } from "@/features/merchants/components/merchant-brand-form";
import { ParticipationStatusBadge } from "@/features/merchants/components/participation-status-badge";
import { listFilesByIds } from "@/server/db/repositories/files.repository";
import { findMerchantById } from "@/server/db/repositories/merchants.repository";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import { publicFileUrl } from "@/server/services/media.service";
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
  const [participations, merchant] = await Promise.all([
    listParticipationsForMerchant(merchantId),
    findMerchantById(ctx.merchant.tenantId, merchantId),
  ]);

  const mediaIds = [merchant?.logoFileId, merchant?.coverFileId].filter((id): id is string =>
    Boolean(id),
  );
  const media = mediaIds.length ? await listFilesByIds(ctx.merchant.tenantId, mediaIds) : [];
  const urlFor = (id: string | null | undefined) => {
    const file = id ? media.find((f) => f.id === id) : null;
    return file ? publicFileUrl(file) : null;
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/merchant" className="text-muted-foreground text-sm hover:underline">
          ← Your merchants
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.merchant.name}</h1>
        <p className="text-muted-foreground text-sm">Your events and listings.</p>
        <Link
          href={`/merchant/${merchantId}/analytics`}
          className="text-sm underline underline-offset-4"
        >
          View analytics →
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Brand
          </CardTitle>
          <CardDescription>Your logo and cover, shown on your public listing.</CardDescription>
        </CardHeader>
        <CardContent>
          <MerchantBrandForm
            merchantId={merchantId}
            logoUrl={urlFor(merchant?.logoFileId)}
            coverUrl={urlFor(merchant?.coverFileId)}
          />
        </CardContent>
      </Card>

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
