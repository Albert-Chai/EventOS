"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/lib/api/errors";
import { recordView, setFavourite } from "@/server/services/visitor.service";

import { recordViewSchema, toggleFavouriteSchema } from "./schemas";
import type { FavouriteResult } from "./state";

/**
 * Public visitor actions (spec §8.8). No auth: the visitor is identified by the
 * `eventos_vid` cookie the service manages, and the tenant + event are resolved
 * from the URL slugs inside the service (never a client value — the §6 public
 * seam). Input is still validated server-side.
 */

export async function toggleFavouriteAction(input: unknown): Promise<FavouriteResult> {
  const parsed = toggleFavouriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  try {
    const { favourite, ...ref } = parsed.data;
    const { favourited } = await setFavourite(ref, favourite);
    // The favourites list is dynamic (reads the cookie), but drop the client
    // router cache so a return visit reflects the change immediately.
    revalidatePath(`/${ref.tenantSlug}/${ref.eventSlug}/favourites`);
    return { ok: true, favourited };
  } catch (error) {
    return {
      ok: false,
      message: isAppError(error) ? error.message : "Couldn’t save that. Please try again.",
    };
  }
}

export async function recordViewAction(input: unknown): Promise<void> {
  const parsed = recordViewSchema.safeParse(input);
  if (!parsed.success) return;
  try {
    await recordView(parsed.data);
  } catch {
    // View tracking is best-effort — never surface an error to the visitor.
  }
}
