/** Form-state shape for workspace settings. Kept out of the "use server" file,
 * which may only export async functions. */
export type WorkspaceSettingsState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialWorkspaceSettingsState: WorkspaceSettingsState = { status: "idle" };
