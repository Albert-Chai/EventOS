"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/server/policies/require-user";
import { setCommentModeration, setMomentModeration } from "@/server/services/moment.service";

import { moderateCommentSchema, moderateMomentSchema } from "./schemas";

/**
 * Organiser moderation. Re-checks `moment.moderate` here even though the page
 * already did — hiding a button is never the access control (spec §14).
 */
export async function moderateMomentAction(formData: FormData): Promise<void> {
  const parsed = moderateMomentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const ctx = await requirePermission("moment.moderate");
  await setMomentModeration(ctx, parsed.data.postId, parsed.data.action, parsed.data.reason);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/moments`);
}

export async function moderateCommentAction(formData: FormData): Promise<void> {
  const parsed = moderateCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const ctx = await requirePermission("moment.moderate");
  await setCommentModeration(ctx, parsed.data.commentId, parsed.data.action, parsed.data.reason);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/moments`);
}
