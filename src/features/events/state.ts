/** Form-state shapes for event actions. Kept out of the "use server" file,
 * which may only export async functions. */

export type EventFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialEventFormState: EventFormState = { status: "idle" };
