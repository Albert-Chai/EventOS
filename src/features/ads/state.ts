/**
 * Form-state shapes for the sponsor/ads actions. Kept out of the `"use server"`
 * file, which may export only async functions (spec §9).
 */

export type AdFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialAdFormState: AdFormState = { status: "idle" };
