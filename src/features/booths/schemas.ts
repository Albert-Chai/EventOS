import { z } from "zod";

import { BOOTH_STATUSES } from "@/server/booths/status";

/** Zod schemas for booth/zone/map forms. Server-side validation is authoritative. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const zoneSchema = z.object({
  name: z.string().trim().min(1, "Give the zone a name.").max(80),
  description: optionalText(500),
  // `<input type="color">` always posts a hex value; empty allowed for "none".
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const floorSchema = z.object({
  name: z.string().trim().min(1, "Give the floor a name.").max(80),
});

export const boothSchema = z.object({
  boothNumber: z.string().trim().min(1, "A booth number is required.").max(24),
  name: optionalText(120),
  zoneId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  mapFloorId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Geometry is optional on create (defaults to centre) and full on edit.
  x: z.coerce.number().min(0).max(1).optional(),
  y: z.coerce.number().min(0).max(1).optional(),
  width: z.coerce.number().min(0.01).max(1).optional(),
  height: z.coerce.number().min(0.01).max(1).optional(),
  rotation: z.coerce.number().optional(),
});

export const boothStatusSchema = z.object({
  status: z.enum(BOOTH_STATUSES),
});

export const moveBoothSchema = z.object({
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  width: z.coerce.number().min(0.01).max(1),
  height: z.coerce.number().min(0.01).max(1),
  rotation: z.coerce.number().default(0),
});

export const assignBoothSchema = z.object({
  boothId: z.string().uuid(),
  participationId: z.string().uuid(),
  note: optionalText(300),
});
