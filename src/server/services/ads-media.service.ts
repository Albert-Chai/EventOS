import { AppError } from "@/lib/api/errors";
import type { TenantScopedContext } from "@/server/context";
import {
  findBookingById,
  updateBooking,
} from "@/server/db/repositories/ad-bookings.repository";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { uploadImage } from "./media.service";

/**
 * Attaching a creative to an ad booking.
 *
 * Kept out of `ads.service.ts` so that module stays free of the media
 * dependency. The Storage path is **server-constructed** from the tenant and the
 * booking id (§6) — the client never influences where the object lands — and the
 * `files` row is written through the repository layer with a scoped `tenant_id`,
 * exactly like every other upload.
 */
export async function attachAdCreative(
  ctx: TenantScopedContext,
  bookingId: string,
  file: File,
): Promise<void> {
  const booking = await findBookingById(ctx.tenant.id, bookingId);
  if (!booking) throw new AppError("NOT_FOUND", { message: "Booking not found." });

  const record = await uploadImage(ctx, {
    tenantId: ctx.tenant.id,
    scope: `events/${booking.eventId}/ads`,
    ownerId: booking.id,
    kind: "ad_creative",
    file,
  });

  await updateBooking(ctx.tenant.id, bookingId, { creativeFileId: record.id });
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.AD_BOOKING_UPDATED,
    resourceType: "ad_booking",
    resourceId: bookingId,
    after: { creativeFileId: record.id },
  });
}
