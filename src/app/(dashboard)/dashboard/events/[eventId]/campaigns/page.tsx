import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignForm } from "@/features/campaigns/components/campaign-form";
import { SendCampaignForm } from "@/features/campaigns/components/send-campaign-form";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  summariseDeliveries,
  type CampaignStatus,
} from "@/server/campaigns/status";
import { countDeliveriesByStatus } from "@/server/db/repositories/campaigns.repository";
import { listCampaigns } from "@/server/services/campaign.service";
import { deliveryIsSimulated } from "@/server/notifications/provider";

export const metadata: Metadata = {
  title: "Campaigns",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<CampaignStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  scheduled: "secondary",
  sending: "secondary",
  sent: "default",
  paused: "secondary",
  cancelled: "outline",
  failed: "destructive",
};

export default async function EventCampaignsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const base = `/dashboard/events/${eventId}/campaigns`;
  const ctx = await requirePermissionOrRedirect("campaign.manage", base);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const campaigns = await listCampaigns(ctx, eventId);
  const reports = await Promise.all(
    campaigns.map(async (campaign) => ({
      campaign,
      report: summariseDeliveries(await countDeliveriesByStatus(ctx.tenant.id, campaign.id)),
    })),
  );
  const simulated = deliveryIsSimulated();

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground text-sm">
          Reach the visitors who engaged with this event.
        </p>
      </div>

      {simulated ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <p className="font-medium">Delivery is simulated in this environment.</p>
          <p className="text-muted-foreground mt-0.5">
            Campaigns record a delivery per recipient so reporting works end to end, but no email or
            push actually leaves the app until a provider is configured.
          </p>
        </div>
      ) : null}

      {reports.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No campaigns yet
            </CardTitle>
            <CardDescription>Compose one below to reach this event&apos;s visitors.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {reports.map(({ campaign, report }) => (
            <li key={campaign.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{campaign.name}</h2>
                    <Badge variant={STATUS_VARIANT[campaign.status]}>
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </Badge>
                    <Badge variant="outline">{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</Badge>
                  </div>
                  {campaign.description ? (
                    <p className="text-muted-foreground mt-1 text-sm">{campaign.description}</p>
                  ) : null}
                </div>

                {campaign.status === "draft" ? (
                  <SendCampaignForm
                    campaignId={campaign.id}
                    disabled={campaign.recipientCount === 0}
                    recipientCount={campaign.recipientCount}
                  />
                ) : null}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <dt className="text-muted-foreground text-xs uppercase">Recipients</dt>
                  <dd className="tabular-nums">{report.recipients || campaign.recipientCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase">Delivered</dt>
                  <dd className="tabular-nums">{report.reached}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase">Delivery rate</dt>
                  <dd className="tabular-nums">{report.deliveryRate}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase">Opened</dt>
                  <dd className="tabular-nums">{report.opened}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase">Failed</dt>
                  <dd className="tabular-nums">{report.failed}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            New campaign
          </CardTitle>
          <CardDescription>
            Pick an audience — the size is resolved from this event&apos;s visitors when you create
            it, and again when you send.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignForm eventId={eventId} />
        </CardContent>
      </Card>
    </div>
  );
}
