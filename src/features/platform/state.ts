/** Form-state shape for platform actions. Kept out of the "use server" file,
 * which may only export async functions. */
export type PlatformActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialPlatformActionState: PlatformActionState = { status: "idle" };
