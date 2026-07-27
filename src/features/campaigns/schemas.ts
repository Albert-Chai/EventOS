import { z } from "zod";

import { AUDIENCE_TYPES, CAMPAIGN_CHANNELS } from "@/server/campaigns/status";

/**
 * Server-side validation for the campaign surfaces (spec §6). Shared constants
 * stay out of the `"use server"` action file (§9).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const createCampaignSchema = z
  .object({
    eventId: z.string().uuid(),
    name: z.string().trim().min(2, "Give the campaign a name.").max(120),
    description: optionalText(400),
    channel: z.enum(CAMPAIGN_CHANNELS),
    subject: optionalText(200),
    body: z.string().trim().min(2, "Write the message.").max(4000),
    ctaLabel: optionalText(60),
    ctaUrl: optionalText(400),
    audienceType: z.enum(AUDIENCE_TYPES),
  })
  // Email without a subject line is a broken send, so require it for that channel.
  .refine((v) => v.channel !== "email" || Boolean(v.subject), {
    message: "Email campaigns need a subject.",
    path: ["subject"],
  });

export const sendCampaignSchema = z.object({
  campaignId: z.string().uuid(),
});
