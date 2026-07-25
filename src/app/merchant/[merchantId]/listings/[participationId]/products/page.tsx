import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductsEditor } from "@/features/merchants/components/products-editor";
import type { ItemView } from "@/features/merchants/components/item-form";
import { listFilesByIds } from "@/server/db/repositories/files.repository";
import { listItemsForParticipation } from "@/server/db/repositories/listing-items.repository";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import { publicFileUrl } from "@/server/services/media.service";
import type { ParticipationStatus } from "@/server/merchants/status";

export const metadata: Metadata = {
  title: "Products",
  robots: { index: false, follow: false },
};

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ merchantId: string; participationId: string }>;
}) {
  const { merchantId, participationId } = await params;
  const base = `/merchant/${merchantId}/listings/${participationId}`;
  await requireMerchantMemberOrRedirect(merchantId, `${base}/products`);

  const participation = (await listParticipationsForMerchant(merchantId)).find(
    (p) => p.id === participationId,
  );
  if (!participation) notFound();

  const status = participation.approvalStatus as ParticipationStatus;
  const editable = status === "draft" || status === "changes_requested";
  const items = await listItemsForParticipation(participationId);

  const imageIds = items.map((it) => it.imageFileId).filter((id): id is string => Boolean(id));
  const images = imageIds.length ? await listFilesByIds(participation.tenantId, imageIds) : [];
  const imageUrlFor = (id: string | null) => {
    const file = id ? images.find((f) => f.id === id) : null;
    return file ? publicFileUrl(file) : null;
  };

  const itemViews: ItemView[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description ?? "",
    price: it.price ?? "",
    promoPrice: it.promoPrice ?? "",
    currency: it.currency,
    dietaryTags: (it.dietaryTags ?? []).join(", "),
    isHalal: it.isHalal,
    availability: it.availability,
    imageUrl: imageUrlFor(it.imageFileId),
  }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href={base} className="text-muted-foreground text-sm hover:underline">
          ← Listing
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-muted-foreground text-sm">
          {editable
            ? "Add the items visitors will see. You can edit these until the listing is approved."
            : "Your items are locked while the listing is under review or approved."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProductsEditor
            merchantId={merchantId}
            participationId={participationId}
            items={itemViews}
            editable={editable}
          />
        </CardContent>
      </Card>
    </div>
  );
}
