import { z } from "zod";

import { VOUCHER_STATUSES, VOUCHER_TYPES } from "@/server/vouchers/status";

/**
 * Server-side validation for the voucher surfaces (CLAUDE §6: all input is
 * validated with Zod on the server; client validation is UX only). Kept out of
 * the `"use server"` action files, which may export only async functions (§9).
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

/** A `datetime-local` input value, or empty. */
const optionalDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? new Date(value) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Enter a valid date.");

const optionalPositiveInt = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? Number(value) : null))
  .refine((n) => n === null || (Number.isInteger(n) && n > 0), "Enter a whole number above 0.");

export const createVoucherSchema = z
  .object({
    eventId: z.string().uuid(),
    title: z.string().trim().min(2, "Give the voucher a title.").max(120),
    description: optionalText(600),
    terms: optionalText(600),
    voucherType: z.enum(VOUCHER_TYPES),
    discountPercent: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? Number(v) : null))
      .refine((n) => n === null || (Number.isInteger(n) && n > 0 && n <= 100), "1–100."),
    discountAmount: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? Math.round(Number(v) * 100) : null))
      .refine((n) => n === null || (Number.isFinite(n) && n > 0), "Enter an amount above 0."),
    merchantId: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    startsAt: optionalDate,
    endsAt: optionalDate,
    totalQuantity: optionalPositiveInt,
    perVisitorLimit: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? Number(v) : 1))
      .refine((n) => Number.isInteger(n) && n > 0 && n <= 100, "1–100."),
  })
  // The value fields that matter depend on the type — enforced here so a
  // percent voucher can never be saved without a percent.
  .refine((v) => v.voucherType !== "discount_percent" || v.discountPercent !== null, {
    message: "Enter a discount percentage.",
    path: ["discountPercent"],
  })
  .refine((v) => v.voucherType !== "discount_amount" || v.discountAmount !== null, {
    message: "Enter a discount amount.",
    path: ["discountAmount"],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, {
    message: "The end date must be after the start date.",
    path: ["endsAt"],
  });

export const voucherStatusSchema = z.object({
  voucherId: z.string().uuid(),
  status: z.enum(VOUCHER_STATUSES),
});

export const claimVoucherSchema = z.object({
  tenantSlug: z.string().min(1).max(200),
  eventSlug: z.string().min(1).max(200),
  voucherId: z.string().uuid(),
});

/** Codes are shown uppercase; accept any case and normalise. */
export const redeemCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Enter the voucher code.")
    .max(40)
    .transform((v) => v.toUpperCase()),
  merchantId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  notes: optionalText(300),
});
