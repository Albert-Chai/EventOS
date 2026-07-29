"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAppError } from "@/lib/api/errors";
import {
  addMomentComment,
  createMomentPost,
  deleteMomentPost,
  removeMomentComment,
  toggleMomentLike,
} from "@/server/services/moment.service";

import {
  commentSchema,
  createMomentSchema,
  deleteMomentSchema,
  likeSchema,
  removeCommentSchema,
} from "./schemas";
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

/**
 * The like toggle. Returns a result object rather than throwing so the
 * optimistic button can revert and say why — the same shape
 * `toggleFavouriteAction` uses.
 *
 * Liking requires an account, so an unauthenticated caller gets a clear message
 * instead of a silent no-op; the button links to sign-in before it ever gets
 * here, but the action re-checks because hiding a control is never the access
 * control (§14).
 */
export async function toggleLikeAction(input: {
  postId: string;
  tenantSlug: string;
  eventSlug: string;
  like: boolean;
}): Promise<{ ok: true; liked: boolean; likes: number } | { ok: false; message: string }> {
  const parsed = likeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That post is no longer available." };

  try {
    const result = await toggleMomentLike(
      { tenantSlug: parsed.data.tenantSlug, eventSlug: parsed.data.eventSlug },
      parsed.data.postId,
      parsed.data.like,
    );
    revalidatePath(`/${parsed.data.tenantSlug}/${parsed.data.eventSlug}/moments`);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      message: isAppError(error) ? error.message : "That didn't work. Try again.",
    };
  }
}

export async function addCommentAction(
  _prev: MomentFormState,
  formData: FormData,
): Promise<MomentFormState> {
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check what you wrote.",
    };
  }

  const { postId, tenantSlug, eventSlug, body } = parsed.data;
  try {
    await addMomentComment({ tenantSlug, eventSlug }, postId, body);
  } catch (error) {
    return fail(error, "Your comment could not be posted.");
  }

  revalidatePath(`/${tenantSlug}/${eventSlug}/moments/${postId}`);
  revalidatePath(`/${tenantSlug}/${eventSlug}/moments`);
  return { status: "success" };
}

export async function removeCommentAction(formData: FormData): Promise<void> {
  const parsed = removeCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await removeMomentComment(parsed.data.commentId);
  revalidatePath(`/${parsed.data.tenantSlug}/${parsed.data.eventSlug}/moments`, "layout");
}
