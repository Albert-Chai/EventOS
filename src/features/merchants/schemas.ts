import { z } from "zod";

import { ITEM_AVAILABILITIES } from "@/server/merchants/status";

/**
 * Zod schemas for the merchant forms (spec §6: all input validated server-side).
 * Empty optional strings are normalised to null in the actions.
 */

const optionalText = (max: number) => z.string().trim().max(max).optional();
const money = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Use a number like 12.50.")
  .optional()
  .or(z.literal(""));

export const merchantSchema = z.object({
  name: z.string().trim().min(2, "Give the merchant a name.").max(160),
  slug: z.string().trim().max(48).optional(),
  categoryId: z.string().trim().optional(),
  description: optionalText(2000),
  contactName: optionalText(120),
  contactEmail: z
    .union([z.string().trim().email("Enter a valid email."), z.literal("")])
    .optional(),
  contactPhone: optionalText(40),
  website: optionalText(200),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Give the category a name.").max(80),
});

export const inviteMerchantSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export const listingSchema = z.object({
  listingTitle: optionalText(160),
  listingDescription: optionalText(2000),
});

export const listingItemSchema = z.object({
  name: z.string().trim().min(1, "Give the item a name.").max(160),
  description: optionalText(600),
  price: money,
  promoPrice: money,
  currency: z.string().trim().max(8).optional(),
  isHalal: z.coerce.boolean().optional(),
  availability: z.enum(ITEM_AVAILABILITIES).optional(),
  // Comma-separated in the form; split into an array in the action.
  dietaryTags: optionalText(200),
});

export type MerchantInput = z.infer<typeof merchantSchema>;
export type ListingItemFormInput = z.infer<typeof listingItemSchema>;
