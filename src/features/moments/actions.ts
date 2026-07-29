"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAppError } from "@/lib/api/errors";
import { createMomentPost, deleteMomentPost } from "@/server/services/moment.service";

import { createMomentSchema, deleteMomentSchema } from "./schemas";
import type { MomentFormState } from "./state";

/**
 * Public Server Actions for Moments.
 *
 * Same-origin and form-driven, so Next's built-in origin check gives CSRF
 * protection without a token dance. Everything that decides *scope* — the
 * tenant, the event, the author — is derived server-side from the URL slugs and
 * the session; the form only ever carries content.
 */

function fail(error: unknown, fallback: string): MomentFormState {
  return { status: "error", message: isAppError(error) ? error.message : fallback };
}

export async function createMomentAction(
  _prev: MomentFormState,
  formData: FormData,
): Promise<MomentFormState> {
  const parsed = createMomentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { tenantSlug, eventSlug, body, participationId, rating } = parsed.data;
  const photo = formData.get("photo");

  try {
    await createMomentPost(
      { tenantSlug, eventSlug },
      {
        body,
        participationId,
        rating,
        photo: photo instanceof File && photo.size > 0 ? photo : null,
      },
    );
  } catch (error) {
    return fail(error, "Your moment could not be posted.");
  }

  // Outside the try: `redirect` works by throwing, and catching it here would
  // turn a successful post into an error message.
  redirect(`/${tenantSlug}/${eventSlug}/moments?posted=1`);
}

export async function deleteMomentAction(formData: FormData): Promise<void> {
  const parsed = deleteMomentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await deleteMomentPost(parsed.data.postId);
  revalidatePath(`/${parsed.data.tenantSlug}/${parsed.data.eventSlug}/moments`);
}
