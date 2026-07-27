import { z } from "zod";

import { isClientTrackable } from "@/server/analytics/taxonomy";

/**
 * Validation for the public tracking beacon and the QR-panel actions. Shared
 * constants/types stay out of the `"use server"` action file (spec §9). The
 * event name is constrained to the client-trackable subset — favourite/QR events
 * only ever originate server-side, so the beacon can't forge them.
 */

export const trackEventSchema = z.object({
  name: z.string().refine(isClientTrackable, "Unsupported event"),
  tenantSlug: z.string().min(1).max(200),
  eventSlug: z.string().min(1).max(200),
  merchantSlug: z.string().min(1).max(200).optional(),
  // Bounded free-form context (search `q`, applied filters, share channel …).
  props: z
    .record(z.string().max(60), z.union([z.string().max(300), z.number(), z.boolean()]))
    .optional(),
});

export type TrackEventInput = z.infer<typeof trackEventSchema>;

export const eventQrSchema = z.object({
  eventId: z.string().uuid(),
});

export const merchantQrSchema = z.object({
  merchantId: z.string().uuid(),
  participationId: z.string().uuid(),
});
