/**
 * Form-state shapes for the voucher actions. Kept out of the `"use server"`
 * files, which may export only async functions (spec §9).
 */

export type VoucherFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialVoucherFormState: VoucherFormState = { status: "idle" };

/** What the public claim button gets back. */
export type ClaimResult =
  | { ok: true; code: string; title: string }
  | { ok: false; message: string };

/** What the merchant/organizer redeem screen gets back. */
export type RedeemState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      code: string;
      title: string;
      discountLabel: string;
      redeemedAt: string;
    };

export const initialRedeemState: RedeemState = { status: "idle" };
