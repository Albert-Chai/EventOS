"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAppError } from "@/lib/api/errors";
import { requireUser } from "@/server/policies/require-user";
import { setActiveTenantCookie } from "@/server/session/cookies";
import { acceptInvitation } from "@/server/services/membership.service";

import type { AcceptState } from "./state";

/**
 * Accepts an invitation for the signed-in user, then drops them into the new
 * workspace by making it active. The token is validated server-side (pending,
 * unexpired, addressed to this user) before any membership is created.
 */
export async function acceptInvitationAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = formData.get("token")?.toString() ?? "";
  const ctx = await requireUser();

  let tenantId: string;
  try {
    const result = await acceptInvitation(ctx, token);
    tenantId = result.tenantId;
  } catch (error) {
    return {
      status: "error",
      message: isAppError(error) ? error.message : "Could not accept this invitation.",
    };
  }

  await setActiveTenantCookie(tenantId);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
