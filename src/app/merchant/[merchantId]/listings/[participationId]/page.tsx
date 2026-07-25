import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BoothConfirmCard } from "@/features/booths/components/booth-confirm-card";
import { ListingForm } from "@/features/merchants/components/listing-form";
import { ParticipationStatusBadge } from "@/features/merchants/components/participation-status-badge";
import { SubmitControls } from "@/features/merchants/components/submit-controls";
import { findAssignedBoothForMerchantParticipation } from "@/server/db/repositories/booth-assignments.repository";
import { listParticipationsForMerchant } from "@/server/db/repositories/participations.repository";
import { requireMerchantMemberOrRedirect } from "@/server/policies/require-merchant";
import type { ParticipationStatus } from "@/server/merchants/status";

export const metadata: Metadata = {
  title: "Listing",
  robots: { index: false, follow: false },
};

export default async function ListingPage({
  params,
}: {
  params: Promise<{ merchantId: string; participationId: string }>;
}) {
  const { merchantId, participationId } = await params;
  const base = `/merchant/${merchantId}/listings/${participationId}`;
  await requireMerchantMemberOrRedirect(merchantId, base);

  const participation = (await listParticipationsForMerchant(merchantId)).find(
    (p) => p.id === participationId,
  );
  if (!participation) notFound();

  const status = participation.approvalStatus as ParticipationStatus;
  const editable = status === "draft" || status === "changes_requested";
  const assignedBooth = await findAssignedBoothForMerchantParticipation(
    merchantId,
    participationId,
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/merchant/${merchantId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {participation.eventName}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Your listing</h1>
          <ParticipationStatusBadge status={status} />
        </div>
      </div>

      {participation.reviewNote && (status === "changes_requested" || status === "rejected") ? (
        <Alert variant={status === "rejected" ? "destructive" : "default"}>
          <AlertTitle>
            {status === "rejected"
              ? "This listing was rejected"
              : "The organizer asked for changes"}
          </AlertTitle>
          <AlertDescription>{participation.reviewNote}</AlertDescription>
        </Alert>
      ) : null}

      {assignedBooth ? (
        <BoothConfirmCard
          merchantId={merchantId}
          participationId={participationId}
          assignment={{
            assignmentId: assignedBooth.assignmentId,
            assignmentStatus: assignedBooth.assignmentStatus,
            boothNumber: assignedBooth.boothNumber,
            boothName: assignedBooth.boothName,
            zoneName: assignedBooth.zoneName,
            zoneColor: assignedBooth.zoneColor,
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Listing details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListingForm
            merchantId={merchantId}
            participationId={participationId}
            listingTitle={participation.listingTitle ?? ""}
            listingDescription={participation.listingDescription ?? ""}
            disabled={!editable}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`${base}/products`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Products
        </Link>
        <Link
          href={`${base}/preview`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Preview
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Submission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SubmitControls
            merchantId={merchantId}
            participationId={participationId}
            status={status}
          />
        </CardContent>
      </Card>
    </div>
  );
}
