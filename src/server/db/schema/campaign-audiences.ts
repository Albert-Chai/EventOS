import { index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { campaigns } from "./campaigns";
import { tenants } from "./tenants";
import type { AudienceType } from "../../campaigns/status";

/**
 * Who a campaign targets (spec §8.12). Kept as its own table rather than a column
 * on `campaigns` because a campaign may combine several audience rules, and the
 * resolved size is worth storing per rule for the report.
 *
 * `filter_json` holds the rule's parameters (e.g. `{ merchantId }` for
 * `favourited_merchant`, `{ voucherId }` for `claimed_voucher`, `{ days }` for
 * `recent_visitors`). The **resolution query lives in the repository layer**, so
 * the audience is always re-derived under tenant scope — never trusted from here.
 */
export const campaignAudiences = pgTable(
  "campaign_audiences",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    audienceType: text("audience_type").notNull().default("all_visitors").$type<AudienceType>(),
    filterJson: jsonb("filter_json"),
    estimatedSize: integer("estimated_size").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("campaign_audiences_campaign_idx").on(table.campaignId),
    index("campaign_audiences_tenant_idx").on(table.tenantId),
  ],
);

export type CampaignAudience = typeof campaignAudiences.$inferSelect;
export type NewCampaignAudience = typeof campaignAudiences.$inferInsert;
