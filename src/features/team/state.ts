/** Form-state shapes for team actions. Kept out of the "use server" files,
 * which may only export async functions. */

export type TeamActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  inviteUrl?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialTeamActionState: TeamActionState = { status: "idle" };

export type AcceptState = { status: "idle" | "error"; message?: string };

export const initialAcceptState: AcceptState = { status: "idle" };
