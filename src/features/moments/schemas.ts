import { z } from "zod";

import { MOMENT_BODY_MAX, MOMENT_RATING_MAX, MOMENT_RATING_MIN } from "@/server/moments/status";

/**
 * Moments input schemas. Server-side validation is the authoritative one; the
 * client mirrors it for inline feedback only (§6).
 *
 * Note what is *not* here: `tenantId`, `eventId`, `visitorId`. Those are
 * resolved server-side from the URL slugs and the session — a form can't name
 * the tenant it writes into.
 */

/**
 * An untouched `<select>`/`<input>` submits `""`, and a form that omits the
 * control submits nothing at all. Both mean "not set", so normalise before
 * validating rather than making every optional field fail on an empty string.
 */
const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export const createMomentSchema = z.object({
  tenantSlug: z.string().min(1),
  eventSlug: z.string().min(1),
  body: z.preprocess(
    blankToNull,
    z.string().max(MOMENT_BODY_MAX, `Keep it under ${MOMENT_BODY_MAX} characters.`).nullable(),
  ),
  participationId: z.preprocess(blankToNull, z.uuid("Pick a stall from the list.").nullable()),
  rating: z.preprocess(
    (value) => {
      const text = blankToNull(value);
      return text === null ? null : Number(text);
    },
    z
      .number()
      .int()
      .min(MOMENT_RATING_MIN, "A rating is 1 to 5 stars.")
      .max(MOMENT_RATING_MAX, "A rating is 1 to 5 stars.")
      .nullable(),
  ),
});

export const deleteMomentSchema = z.object({
  postId: z.uuid(),
  tenantSlug: z.string().min(1),
  eventSlug: z.string().min(1),
});

export const moderateMomentSchema = z.object({
  eventId: z.uuid(),
  postId: z.uuid(),
  action: z.enum(["hide", "restore"]),
  reason: z.string().trim().max(200).optional(),
});
