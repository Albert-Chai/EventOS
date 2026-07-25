"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAppError } from "@/lib/api/errors";
import { requirePlatformAdmin } from "@/server/policies/require-user";
import { grantAdminByEmail, revokeAdmin } from "@/server/services/platform.service";
import { createTenant, suspendTenant } from "@/server/services/tenant.service";

import type { PlatformActionState } from "./state";

/**
 * Platform-admin actions. Every one calls `requirePlatformAdmin` first — the
 * `/platform` route guard is a UX redirect, this is the real gate.
 */

export async function createTenantAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const ctx = await requirePlatformAdmin();

  const name = formData.get("name")?.toString() ?? "";
  const slug = formData.get("slug")?.toString() || undefined;
  const ownerEmail = formData.get("ownerEmail")?.toString() ?? "";

  let ownerLinked = false;
  try {
    const result = await createTenant(ctx, { name, slug, ownerEmail });
    ownerLinked = result.ownerLinked;
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Could not create the tenant.",
    };
  }

  revalidatePath("/platform/tenants");
  if (!ownerLinked) {
    // Tenant exists but the owner has no account yet — tell the admin to invite.
    return {
      status: "success",
      message: `Tenant created. ${ownerEmail} has no account yet — open the tenant and send them an invitation to link them as owner.`,
    };
  }
  redirect("/platform/tenants");
}

export async function suspendTenantAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin();
  const tenantId = formData.get("tenantId")?.toString() ?? "";
  const suspend = formData.get("suspend")?.toString() === "true";
  await suspendTenant(ctx, tenantId, suspend);
  revalidatePath("/platform/tenants");
}

export async function grantAdminAction(
  _prev: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  const ctx = await requirePlatformAdmin();
  const email = formData.get("email")?.toString() ?? "";
  const note = formData.get("note")?.toString() || undefined;

  try {
    await grantAdminByEmail(ctx, email, note);
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Could not grant admin.",
    };
  }

  revalidatePath("/platform/admins");
  return { status: "success", message: `${email} is now a platform administrator.` };
}

export async function revokeAdminAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin();
  const userId = formData.get("userId")?.toString() ?? "";
  await revokeAdmin(ctx, userId);
  revalidatePath("/platform/admins");
}
