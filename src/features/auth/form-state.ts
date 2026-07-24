/**
 * Shared shape for the auth Server Action results.
 *
 * Lives outside `actions.ts` because a `"use server"` module may only export
 * async functions — a plain object export there is a build error.
 */
export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialAuthFormState: AuthFormState = { status: "idle" };
