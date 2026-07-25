import { z } from "zod";

import { EVENT_THEMES } from "@/server/db/schema";
import { EVENT_TYPES, EVENT_VISIBILITIES } from "@/server/events/event-types";

/**
 * Zod schemas for the event forms (spec §6: all input validated server-side;
 * client validation is UX only). Empty strings from optional fields are treated
 * as "not provided" and normalised to null in the action.
 */

/** `datetime-local` value → Date | null, rejecting an unparseable string. */
const optionalDateTime = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), { message: "Enter a valid date." });

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const eventDetailsSchema = z.object({
  name: z.string().trim().min(2, "Give the event a name.").max(120),
  slug: z.string().trim().max(48).optional(),
  eventType: z.enum(EVENT_TYPES),
  visibility: z.enum(EVENT_VISIBILITIES),
  shortDescription: optionalText(200),
  description: optionalText(5000),
  venueName: optionalText(160),
  venueAddress: optionalText(300),
  timezone: optionalText(64),
  startAt: optionalDateTime,
  endAt: optionalDateTime,
});

export type EventDetailsInput = z.infer<typeof eventDetailsSchema>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a2b3c.");

export const brandingSchema = z.object({
  theme: z.enum(EVENT_THEMES),
  primaryColor: hexColor,
  secondaryColor: z.union([hexColor, z.literal("")]).optional(),
  accentColor: z.union([hexColor, z.literal("")]).optional(),
});

export const operatingHourSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  opensAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  closesAt: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  isClosed: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

export const operatingHoursSchema = z.array(operatingHourSchema).max(90);

export type OperatingHourForm = z.infer<typeof operatingHourSchema>;
