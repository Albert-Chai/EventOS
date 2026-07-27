import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  campaignAudiences,
  campaignMessages,
  campaigns,
  notificationDeliveries,
  visitorFavourites,
  visitorRecentViews,
  voucherClaims,
  type Campaign,
  type CampaignMessage,
  type NewCampaign,
  type NewCampaignAudience,
  type NewCampaignMessage,
  type NewNotificationDelivery,
} from "@/server/db/schema";
import type { AudienceType, DeliveryStatus } from "@/server/campaigns/status";

/**
 * Campaigns, their content, audiences, and per-recipient deliveries
 * (spec §8.12, §34 Phase 8). Every read is tenant-scoped; the audience
 * resolution queries are **always** re-derived here under `tenant_id` + `event_id`
 * rather than trusting a stored recipient list.
 */

export async function insertCampaign(row: NewCampaign): Promise<Campaign> {
  const [created] = await db.insert(campaigns).values(row).returning();
  return created!;
}

export async function findCampaignById(tenantId: string, id: string): Promise<Campaign | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function listCampaignsForEvent(
  tenantId: string,
  eventId: string,
): Promise<Campaign[]> {
  return db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.tenantId, tenantId), eq(campaigns.eventId, eventId)))
    .orderBy(desc(campaigns.createdAt));
}

export async function updateCampaign(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      Campaign,
      | "name"
      | "description"
      | "status"
      | "scheduledAt"
      | "sentAt"
      | "recipientCount"
      | "sentCount"
      | "failedCount"
    >
  >,
): Promise<Campaign | null> {
  const [row] = await db
    .update(campaigns)
    .set(patch)
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function insertCampaignMessage(row: NewCampaignMessage): Promise<CampaignMessage> {
  const [created] = await db.insert(campaignMessages).values(row).returning();
  return created!;
}

export async function findCampaignMessage(campaignId: string): Promise<CampaignMessage | null> {
  const [row] = await db
    .select()
    .from(campaignMessages)
    .where(eq(campaignMessages.campaignId, campaignId))
    .limit(1);
  return row ?? null;
}

export async function insertCampaignAudience(row: NewCampaignAudience): Promise<void> {
  await db.insert(campaignAudiences).values(row);
}

export async function findCampaignAudience(campaignId: string) {
  const [row] = await db
    .select()
    .from(campaignAudiences)
    .where(eq(campaignAudiences.campaignId, campaignId))
    .limit(1);
  return row ?? null;
}

// --- Audience resolution ---------------------------------------------------

/**
 * Resolves an audience rule to visitor ids, scoped to the campaign's tenant +
 * event. Each branch reads a Phase 5/8 table that already carries both columns,
 * so a campaign can never reach another tenant's visitors.
 *
 * `all_visitors` uses recent views — our only record of "someone was here", since
 * browsing itself writes nothing (the Phase 5 contract).
 */
export async function resolveAudience(
  tenantId: string,
  eventId: string,
  audienceType: AudienceType,
  filter: { merchantId?: string; voucherId?: string; days?: number } = {},
): Promise<string[]> {
  switch (audienceType) {
    case "favourited_merchant": {
      const where = filter.merchantId
        ? and(
            eq(visitorFavourites.tenantId, tenantId),
            eq(visitorFavourites.eventId, eventId),
            eq(visitorFavourites.merchantId, filter.merchantId),
          )
        : and(eq(visitorFavourites.tenantId, tenantId), eq(visitorFavourites.eventId, eventId));
      const rows = await db
        .selectDistinct({ visitorId: visitorFavourites.visitorId })
        .from(visitorFavourites)
        .where(where);
      return rows.map((r) => r.visitorId);
    }
    case "claimed_voucher": {
      const where = filter.voucherId
        ? and(
            eq(voucherClaims.tenantId, tenantId),
            eq(voucherClaims.eventId, eventId),
            eq(voucherClaims.voucherId, filter.voucherId),
          )
        : and(eq(voucherClaims.tenantId, tenantId), eq(voucherClaims.eventId, eventId));
      const rows = await db
        .selectDistinct({ visitorId: voucherClaims.visitorId })
        .from(voucherClaims)
        .where(where);
      return rows.map((r) => r.visitorId);
    }
    case "recent_visitors": {
      const days = filter.days ?? 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await db
        .selectDistinct({ visitorId: visitorRecentViews.visitorId })
        .from(visitorRecentViews)
        .where(
          and(
            eq(visitorRecentViews.tenantId, tenantId),
            eq(visitorRecentViews.eventId, eventId),
            gte(visitorRecentViews.viewedAt, since),
          ),
        );
      return rows.map((r) => r.visitorId);
    }
    case "all_visitors":
    default: {
      const rows = await db
        .selectDistinct({ visitorId: visitorRecentViews.visitorId })
        .from(visitorRecentViews)
        .where(
          and(eq(visitorRecentViews.tenantId, tenantId), eq(visitorRecentViews.eventId, eventId)),
        );
      return rows.map((r) => r.visitorId);
    }
  }
}

// --- Deliveries + reporting -------------------------------------------------

export async function insertDeliveries(rows: NewNotificationDelivery[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(notificationDeliveries).values(rows);
}

/** Marks every queued delivery for a campaign as sent (the simulated send). */
export async function markDeliveriesSent(
  campaignId: string,
  provider: string,
  sentAt: Date,
): Promise<number> {
  const rows = await db
    .update(notificationDeliveries)
    .set({ status: "sent", provider, sentAt })
    .where(
      and(
        eq(notificationDeliveries.campaignId, campaignId),
        eq(notificationDeliveries.status, "queued"),
      ),
    )
    .returning({ id: notificationDeliveries.id });
  return rows.length;
}

/** Delivery-status counts for one campaign — the input to `summariseDeliveries`. */
export async function countDeliveriesByStatus(
  tenantId: string,
  campaignId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: notificationDeliveries.status, value: count() })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.tenantId, tenantId),
        eq(notificationDeliveries.campaignId, campaignId),
      ),
    )
    .groupBy(notificationDeliveries.status);

  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row.value;
  return out;
}

/** Marks a delivery opened/clicked — the engagement hook a real provider webhook drives. */
export async function markDeliveryEngagement(
  id: string,
  status: Extract<DeliveryStatus, "opened" | "clicked">,
  at: Date,
): Promise<void> {
  await db
    .update(notificationDeliveries)
    .set({
      status,
      openedAt: sql`coalesce(${notificationDeliveries.openedAt}, ${at})`,
      clickedAt: status === "clicked" ? at : notificationDeliveries.clickedAt,
    })
    .where(eq(notificationDeliveries.id, id));
}
