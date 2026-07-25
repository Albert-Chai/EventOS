"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppError, isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import { EVENT_SETTING_KEYS } from "@/server/db/schema";
import { parseImageChange } from "@/server/services/entity-media.service";
import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  setEventBrandingImage,
  setOperatingHours,
  transitionEventStatus,
  updateBranding,
  updateEvent,
  updateSettings,
} from "@/server/services/event.service";
import { isEventStatus, permissionForTransition } from "@/server/events/status";

import { brandingSchema, eventDetailsSchema, operatingHoursSchema } from "./schemas";
import type { EventFormState } from "./state";

/**
 * Event Server Actions. Each is gated by the matching `event.*` permission via
 * `requirePermission` in the call path — the UI hiding a control is never the
 * access control (spec §14). Validation is Zod, server-side (spec §6).
 */

function errorState(error: unknown): EventFormState {
  if (isAppError(error) || error instanceof AppError) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

/** Empty optional strings → null, so a cleared field clears the column. */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const parsed = eventDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let eventId: string;
  try {
    const ctx = await requirePermission("event.create");
    const d = parsed.data;
    const event = await createEvent(ctx, {
      name: d.name,
      slug: orNull(d.slug) ?? undefined,
      eventType: d.eventType,
      visibility: d.visibility,
      shortDescription: orNull(d.shortDescription),
      description: orNull(d.description),
      venueName: orNull(d.venueName),
      venueAddress: orNull(d.venueAddress),
      timezone: orNull(d.timezone) ?? undefined,
      startAt: d.startAt,
      endAt: d.endAt,
    });
    eventId = event.id;
  } catch (error) {
    return errorState(error);
  }

  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${eventId}`);
}

export async function updateEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = eventDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("event.update");
    const d = parsed.data;
    await updateEvent(ctx, eventId, {
      name: d.name,
      slug: orNull(d.slug) ?? undefined,
      eventType: d.eventType,
      visibility: d.visibility,
      shortDescription: orNull(d.shortDescription),
      description: orNull(d.description),
      venueName: orNull(d.venueName),
      venueAddress: orNull(d.venueAddress),
      timezone: orNull(d.timezone) ?? undefined,
      startAt: d.startAt,
      endAt: d.endAt,
    });
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { status: "success", message: "Saved." };
}

export async function transitionStatusAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const to = formData.get("to")?.toString() ?? "";
  if (!isEventStatus(to)) {
    return { status: "error", message: "Unknown status." };
  }

  try {
    const ctx = await requirePermission(permissionForTransition(to));
    await transitionEventStatus(ctx, eventId, to);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return { status: "success", message: `Moved to ${to.replace(/_/g, " ")}.` };
}

export async function updateSettingsAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  // An unchecked checkbox submits nothing, so presence == true.
  const patch = Object.fromEntries(
    EVENT_SETTING_KEYS.map((key) => [key, formData.get(key) != null]),
  );

  try {
    const ctx = await requirePermission("event.update");
    await updateSettings(ctx, eventId, patch);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return { status: "success", message: "Settings saved." };
}

export async function updateBrandingAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("event.update");
    await updateBranding(ctx, eventId, {
      theme: parsed.data.theme,
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor || null,
      accentColor: parsed.data.accentColor || null,
    });
    const logo = parseImageChange(formData, "logo");
    if (logo) await setEventBrandingImage(ctx, eventId, "logo", logo);
    const cover = parseImageChange(formData, "cover");
    if (cover) await setEventBrandingImage(ctx, eventId, "cover", cover);
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}/branding`);
  return { status: "success", message: "Branding saved." };
}

export async function updateHoursAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(formData.get("hours")?.toString() ?? "[]");
  } catch {
    return { status: "error", message: "Could not read the hours." };
  }

  const parsed = operatingHoursSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: "Each open day needs a date and times." };
  }

  try {
    const ctx = await requirePermission("event.update");
    await setOperatingHours(
      ctx,
      eventId,
      parsed.data.map((r) => ({
        date: r.date,
        opensAt: r.isClosed ? null : r.opensAt || null,
        closesAt: r.isClosed ? null : r.closesAt || null,
        isClosed: r.isClosed,
        note: r.note?.trim() || null,
      })),
    );
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/events/${eventId}/hours`);
  return { status: "success", message: "Operating hours saved." };
}

export async function duplicateEventAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const ctx = await requirePermission("event.create");
  const copy = await duplicateEvent(ctx, eventId);
  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${copy.id}`);
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const ctx = await requirePermission("event.delete");
  await deleteEvent(ctx, eventId);
  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}
