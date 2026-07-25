"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/lib/api/errors";
import { requirePermission, requireUser } from "@/server/policies/require-user";
import { setActiveTenantCookie } from "@/server/session/cookies";
import { updateOwnTenant } from "@/server/services/tenant.service";

import type { WorkspaceSettingsState } from "./state";

/**
 * Switches the active tenant.
 *
 * The requested id is validated against the user's *own* memberships before the
 * cookie is set — the cookie can only ever select among tenants the user
 * already belongs to, never grant access to a new one (spec §5).
 */
export async function switchTenantAction(formData: FormData): Promise<void> {
  const tenantId = formData.get("tenantId")?.toString() ?? "";
  const ctx = await requireUser();

  const isMember = ctx.memberships.some((m) => m.id === tenantId);
  if (!isMember) {
    // Silently ignore a bad selection rather than erroring — a stale form or a
    // tampered value should just be a no-op.
    ctx.log.warn("workspace.switch_rejected", { tenantId });
    return;
  }

  await setActiveTenantCookie(tenantId);
  revalidatePath("/dashboard", "layout");
}

export async function updateWorkspaceAction(
  _prev: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  try {
    const ctx = await requirePermission("settings.manage");
    await updateOwnTenant(ctx, {
      name: formData.get("name")?.toString(),
      contactEmail: formData.get("contactEmail")?.toString() || undefined,
      contactPhone: formData.get("contactPhone")?.toString() || undefined,
    });
    revalidatePath("/dashboard", "layout");
    return { status: "success", message: "Workspace updated." };
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Could not update the workspace.",
    };
  }
}
