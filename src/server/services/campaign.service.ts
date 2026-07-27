import { AppError } from "@/lib/api/errors";
import {
  countDeliveriesByStatus,
  findCampaignAudience,
  findCampaignById,
  findCampaignMessage,
  insertCampaign,
  insertCampaignAudience,
  insertCampaignMessage,
  insertDeliveries,
  listCampaignsForEvent,
  markDeliveriesSent,
  resolveAudience,
  updateCampaign,
} from "@/server/db/repositories/campaigns.repository";
import { insertUsageRecord } from "@/server/db/repositories/usage-records.repository";
import type { TenantScopedContext } from "@/server/context";
import type { Campaign } from "@/server/db/schema";
import {
  canTransitionCampaign,
  summariseDeliveries,
  usageMetricForChannel,
  type AudienceType,
  type CampaignChannel,
  type CampaignReport,
} from "@/server/campaigns/status";
import { getNotificationProvider } from "@/server/notifications/provider";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { requirePlanFeature } from "./usage.service";

/**
 * Campaigns (spec §8.12, §34 Phase 8): compose, resolve an audience, send, and
 * report.
 *
 * Delivery goes through the provider seam (`server/notifications/provider.ts`),
 * which is **simulated** in this phase — every `notification_deliveries` row is
 * real, but nothing is transmitted. The status machine, audience resolution and
 * reporting are exactly what a real provider adapter will drive.
 */

export type CreateCampaignInput = {
  eventId: string;
  name: string;
  description?: string | null;
  channel: CampaignChannel;
  subject?: string | null;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  audienceType: AudienceType;
  audienceFilter?: { merchantId?: string; voucherId?: string; days?: number };
};

export async function createCampaign(
  ctx: TenantScopedContext,
  input: CreateCampaignInput,
): Promise<Campaign> {
  // Campaigns are a paid entitlement (Phase 6 defined it; this is its first use).
  await requirePlanFeature(ctx.tenant.id, "campaigns");

  const campaign = await insertCampaign({
    tenantId: ctx.tenant.id,
    eventId: input.eventId,
    name: input.name,
    description: input.description ?? null,
    channel: input.channel,
    createdBy: ctx.user.id,
  });

  await insertCampaignMessage({
    tenantId: ctx.tenant.id,
    campaignId: campaign.id,
    channel: input.channel,
    subject: input.subject ?? null,
    body: input.body,
    ctaLabel: input.ctaLabel ?? null,
    ctaUrl: input.ctaUrl ?? null,
  });

  // Size the audience now so the organizer sees the reach before sending.
  const recipients = await resolveAudience(
    ctx.tenant.id,
    input.eventId,
    input.audienceType,
    input.audienceFilter ?? {},
  );
  await insertCampaignAudience({
    tenantId: ctx.tenant.id,
    campaignId: campaign.id,
    audienceType: input.audienceType,
    filterJson: input.audienceFilter ?? null,
    estimatedSize: recipients.length,
  });
  await updateCampaign(ctx.tenant.id, campaign.id, { recipientCount: recipients.length });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.CAMPAIGN_CREATED,
    resourceType: "campaign",
    resourceId: campaign.id,
    after: { name: campaign.name, channel: campaign.channel, audience: input.audienceType },
  });

  return { ...campaign, recipientCount: recipients.length };
}

export async function listCampaigns(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<Campaign[]> {
  return listCampaignsForEvent(ctx.tenant.id, eventId);
}

/**
 * Sends a campaign: re-resolve the audience, write a delivery per recipient, hand
 * each to the provider, then settle the campaign. The audience is re-derived at
 * send time (never a stored recipient list), so it is always tenant-scoped and
 * current.
 */
export async function sendCampaign(
  ctx: TenantScopedContext,
  campaignId: string,
): Promise<{ recipients: number; sent: number; simulated: boolean }> {
  const campaign = await findCampaignById(ctx.tenant.id, campaignId);
  if (!campaign) throw new AppError("CAMPAIGN_NOT_FOUND");

  if (!canTransitionCampaign(campaign.status, "sending")) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `A ${campaign.status} campaign cannot be sent.`,
    });
  }

  const [message, audience] = await Promise.all([
    findCampaignMessage(campaignId),
    findCampaignAudience(campaignId),
  ]);
  if (!message) throw new AppError("CONFLICT", { message: "This campaign has no content yet." });

  await updateCampaign(ctx.tenant.id, campaignId, { status: "sending" });

  try {
    const filter = (audience?.filterJson ?? {}) as {
      merchantId?: string;
      voucherId?: string;
      days?: number;
    };
    const recipients = await resolveAudience(
      ctx.tenant.id,
      campaign.eventId,
      audience?.audienceType ?? "all_visitors",
      filter,
    );

    await insertDeliveries(
      recipients.map((visitorId) => ({
        tenantId: ctx.tenant.id,
        campaignId: campaign.id,
        messageId: message.id,
        eventId: campaign.eventId,
        visitorId,
        channel: campaign.channel,
        status: "queued" as const,
      })),
    );

    const provider = getNotificationProvider(campaign.channel);
    // Anonymous visitors have no address yet, so `to` is null and the simulated
    // provider records the send. A real adapter would skip addressless recipients.
    const result = await provider.send({
      channel: campaign.channel,
      to: null,
      subject: message.subject,
      body: message.body,
    });
    if (!result.ok) throw new AppError("SERVICE_UNAVAILABLE", { message: result.error });

    const sentAt = new Date();
    const sent = await markDeliveriesSent(campaign.id, provider.name, sentAt);

    await updateCampaign(ctx.tenant.id, campaignId, {
      status: "sent",
      sentAt,
      recipientCount: recipients.length,
      sentCount: sent,
      failedCount: 0,
    });

    // §22: sends bill against the tenant's monthly quota (the ledger metrics
    // Phase 6 defined and left for this phase to write).
    const metric = usageMetricForChannel(campaign.channel);
    if (metric && sent > 0) {
      await insertUsageRecord({
        tenantId: ctx.tenant.id,
        eventId: campaign.eventId,
        metric,
        quantity: sent,
        source: "campaign",
      });
    }

    await recordAudit(ctx, {
      action: AUDIT_ACTIONS.CAMPAIGN_SENT,
      resourceType: "campaign",
      resourceId: campaign.id,
      after: { recipients: recipients.length, sent, provider: provider.name },
    });

    return { recipients: recipients.length, sent, simulated: !provider.delivers };
  } catch (error) {
    await updateCampaign(ctx.tenant.id, campaignId, { status: "failed" });
    throw error;
  }
}

export type CampaignReportView = CampaignReport & {
  campaign: Campaign;
  simulated: boolean;
};

/** Per-campaign performance — the §34 "organizer can see campaign performance" bar. */
export async function getCampaignReport(
  ctx: TenantScopedContext,
  campaignId: string,
): Promise<CampaignReportView> {
  const campaign = await findCampaignById(ctx.tenant.id, campaignId);
  if (!campaign) throw new AppError("CAMPAIGN_NOT_FOUND");

  const counts = await countDeliveriesByStatus(ctx.tenant.id, campaignId);
  return {
    campaign,
    simulated: !getNotificationProvider(campaign.channel).delivers,
    ...summariseDeliveries(counts),
  };
}

/** Audience size preview for the compose form. */
export async function previewAudience(
  ctx: TenantScopedContext,
  eventId: string,
  audienceType: AudienceType,
  filter: { merchantId?: string; voucherId?: string; days?: number } = {},
): Promise<number> {
  const recipients = await resolveAudience(ctx.tenant.id, eventId, audienceType, filter);
  return recipients.length;
}
