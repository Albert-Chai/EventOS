/**
 * Form-state shapes for campaign actions. Kept out of the `"use server"` file,
 * which may export only async functions (spec §9).
 */

export type CampaignFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialCampaignFormState: CampaignFormState = { status: "idle" };
