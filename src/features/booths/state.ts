/** Form-state shapes for booth/zone/map actions. Kept out of the "use server"
 * files, which may only export async functions. */

export type BoothFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialBoothFormState: BoothFormState = { status: "idle" };
