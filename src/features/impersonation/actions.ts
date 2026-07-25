"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePlatformAdmin, requireUser } from "@/server/policies/require-user";
import { startImpersonation, stopImpersonation } from "@/server/services/impersonation.service";

/**
 * Start impersonating a tenant (platform admin only). After this, the acting
 * admin's requests resolve to the impersonated tenant until they stop or it
 * expires.
 */
export async function startImpersonationAction(formData: FormData): Promise<void> {
  const ctx = await requirePlatformAdmin();
  const tenantId = formData.get("tenantId")?.toString() ?? "";
  const reason = formData.get("reason")?.toString();

  await startImpersonation(ctx, { tenantId, reason });
  redirect("/dashboard");
}

/**
 * Stop impersonating. Only ends the caller's *own* session — the service reads
 * the session id from context, never from the form.
 */
export async function stopImpersonationAction(): Promise<void> {
  const ctx = await requireUser();
  await stopImpersonation(ctx);
  revalidatePath("/", "layout");
  redirect("/platform/tenants");
}
