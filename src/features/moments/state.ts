/**
 * Form state for the Moments actions. A plain module, not `"use server"` — a
 * server-action file may export only async functions (§9).
 */
export type MomentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialMomentFormState: MomentFormState = { status: "idle" };
