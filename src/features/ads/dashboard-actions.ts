"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import {
  createBooking,
  createSponsor,
  setBookingStatus,
} from "@/server/services/ads.service";
import { attachAdCreative } from "@/server/services/ads-media.service";

import { bookingSchema, bookingStatusSchema, sponsorSchema } from "./schemas";
import type { AdFormState } from "./state";

/**
 * Organiser Server Actions for sponsor ad space (spec §14: every action
 * re-checks authority — hiding a control is never the access control). All of
 * these gate on `sponsor.manage`; the service additionally requires the
 * `sponsor_module` plan entitlement.
 */

function fail(error: unknown, fallback: string): AdFormState {
  return { status: "error", message: isAppError(error) ? error.message : fallback };
}

/** `YYYY-MM-DD` → a Date, end-of-day for the closing bound so the last day counts. */
function toDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createSponsorAction(
  _prev: AdFormState,
  formData: FormData,
): Promise<AdFormState> {
  const parsed = sponsorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const ctx = await requirePermission("sponsor.manage");
    await createSponsor(ctx, parsed.data);
  } catch (error) {
    return fail(error, "Could not create the sponsor.");
  }

  revalidatePath("/dashboard/events", "layout");
  return { status: "success", message: "Sponsor added." };
}

export async function createBookingAction(
  _prev: AdFormState,
  formData: FormData,
): Promise<AdFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const creative = formData.get("creative");
  try {
    const ctx = await requirePermission("sponsor.manage");
    const booking = await createBooking(ctx, {
      eventId,
      sponsorId: parsed.data.sponsorId,
      slot: parsed.data.slot,
      clickUrl: parsed.data.clickUrl ?? null,
      altText: parsed.data.altText ?? null,
      startsAt: toDate(parsed.data.startsDate),
      endsAt: toDate(parsed.data.endsDate, true),
      weight: parsed.data.weight,
    });

    // The creative is optional at creation; a booking can't be activated without
    // one, which `setBookingStatus` enforces.
    if (creative instanceof File && creative.size > 0) {
      await attachAdCreative(ctx, booking.id, creative);
    }
  } catch (error) {
    return fail(error, "Could not create the booking.");
  }

  revalidatePath(`/dashboard/events/${eventId}/sponsors`);
  return { status: "success", message: "Booking created." };
}

export async function setBookingStatusAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = bookingStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const ctx = await requirePermission("sponsor.manage");
  await setBookingStatus(ctx, parsed.data.bookingId, parsed.data.status);
  revalidatePath(`/dashboard/events/${eventId}/sponsors`);
}
