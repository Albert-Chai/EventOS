import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { campaigns } from "./campaigns";
import { tenants } from "./tenants";
import type { CampaignChannel } from "../../campaigns/status";

/**
 * The content a campaign sends, per channel (spec §8.12 notification fields).
 * Separate from `campaigns` so one campaign can carry an email body *and* a push
 * body (same audience, channel-appropriate copy), and so an edit to copy doesn't
 * churn the campaign's status row.
 *
 * `notification_deliveries.message_id` points here, so a delivery always knows
 * exactly which content it carried.
 */
export const campaignMessages = pgTable(
  "campaign_messages",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("email").$type<CampaignChannel>(),
    subject: text("subject"),
    previewText: text("preview_text"),
    body: text("body").notNull(),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    ...timestamps,
  },
  (table) => [
    index("campaign_messages_campaign_idx").on(table.campaignId),
    index("campaign_messages_tenant_idx").on(table.tenantId),
  ],
);

export type CampaignMessage = typeof campaignMessages.$inferSelect;
export type NewCampaignMessage = typeof campaignMessages.$inferInsert;
