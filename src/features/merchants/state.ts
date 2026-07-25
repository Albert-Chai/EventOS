/** Form-state shapes for merchant actions. Kept out of the "use server" files,
 * which may only export async functions. */

export type MerchantFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Present when an action produced an invitation link to share. */
  inviteUrl?: string;
};

export const initialMerchantFormState: MerchantFormState = { status: "idle" };

export type AcceptMerchantState = { status: "idle" | "error"; message?: string };

export const initialAcceptMerchantState: AcceptMerchantState = { status: "idle" };
