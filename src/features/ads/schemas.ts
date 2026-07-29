import { z } from "zod";

import { AD_BOOKING_STATUSES, AD_SLOTS } from "@/server/ads/slots";

/**
 * Server-side validation for the sponsor/ads forms (§6: all input validated with
 * Zod on the server; client validation is UX only).
 */

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

export const sponsorSchema = z.object({
  name: z.string().trim().min(2, "Sponsor name is too short.").max(120),
  websiteUrl: optionalText,
  contactEmail: optionalText,
  notes: optionalText,
});

/** `<input type="date">` gives `YYYY-MM-DD`; empty means open-ended. */
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional()
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a YYYY-MM-DD date.");

export const bookingSchema = z.object({
  sponsorId: z.string().uuid("Pick a sponsor."),
  slot: z.enum(AD_SLOTS),
  clickUrl: optionalText,
  altText: optionalText,
  startsDate: optionalDate,
  endsDate: optionalDate,
  weight: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? 1 : Number.parseInt(v, 10)))
    .refine((v) => Number.isFinite(v) && v > 0, "Weight must be a positive whole number."),
});

export const bookingStatusSchema = z.object({
  bookingId: z.string().uuid(),
  status: z.enum(AD_BOOKING_STATUSES),
});
