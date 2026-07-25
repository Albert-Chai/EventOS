import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/features/merchants/format";
import { listPublicItemsForParticipation } from "@/server/db/repositories/listing-items.repository";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";

export const metadata: Metadata = {
  title: "Listing preview",
  robots: { index: false, follow: false },
};

export default async function ListingPreviewPage({
  params,
}: {
  params: Promise<{ merchantId: string; participationId: string }>;
}) {
  const { merchantId, participationId } = await params;
  const base = `/merchant/${merchantId}/listings/${participationId}`;
  const ctx = await requireMerchantMemberOrRedirect(merchantId, `${base}/preview`);

  const participation = (await listParticipationsForMerchant(merchantId)).find(
    (p) => p.id === participationId,
  );
  if (!participation) notFound();

  const items = await listPublicItemsForParticipation(participationId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href={base} className="text-muted-foreground text-sm hover:underline">
          ← Listing
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Preview</h1>
        <p className="text-muted-foreground text-sm">
          How your listing will appear to visitors once it&apos;s approved.
        </p>
      </div>

      <article className="rounded-2xl border p-6">
        <h2 className="text-xl font-semibold">{participation.listingTitle || ctx.merchant.name}</h2>
        {participation.listingDescription ? (
          <p className="mt-2 text-sm whitespace-pre-line">{participation.listingDescription}</p>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No description yet.</p>
        )}

        <h3 className="mt-6 text-sm font-semibold tracking-wide uppercase">Menu</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">No items yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 border-b py-2 last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {item.isHalal ? <Badge variant="secondary">Halal</Badge> : null}
                  </div>
                  {item.description ? (
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm">{formatPrice(item.price, item.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
