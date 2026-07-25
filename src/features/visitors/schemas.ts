import { z } from "zod";

/**
 * Zod schemas for the public visitor actions (spec §6: all input validated
 * server-side). The slugs identify the public target; the service resolves the
 * real tenant + event from them via `findPublicEvent`, so a forged slug can only
 * ever reach a publicly-visible event — never another tenant's data.
 */

const slug = z.string().trim().min(1).max(96);

export const merchantRefSchema = z.object({
  tenantSlug: slug,
  eventSlug: slug,
  merchantSlug: slug,
});

export const recordViewSchema = merchantRefSchema;

export const toggleFavouriteSchema = merchantRefSchema.extend({
  favourite: z.boolean(),
});

export type MerchantRefInput = z.infer<typeof merchantRefSchema>;
