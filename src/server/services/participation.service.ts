import { AppError } from "@/lib/api/errors";
import type { MerchantScopedContext, TenantScopedContext } from "@/server/context";
import { findEventById } from "@/server/db/repositories/events.repository";
import { findMerchantById } from "@/server/db/repositories/merchants.repository";
import {
  findParticipationByEventMerchant,
  findParticipationById,
  findParticipationForMerchant,
  insertParticipation,
  updateParticipation,
  updateParticipationForMerchant,
} from "@/server/db/repositories/participations.repository";
import type { MerchantEventParticipation } from "@/server/db/schema";
import {
  actorForParticipationTransition,
  canTransitionParticipation,
  type ParticipationStatus,
} from "@/server/merchants/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { assertWithinLimit } from "./usage.service";

/**
 * The approval workflow (spec §7.2, §8.4). A participation is a merchant's
 * listing for one event. The organizer adds merchants and renders verdicts
 * (tenant-scoped); the merchant edits and submits (membership-scoped). The status
 * machine (`src/server/merchants/status.ts`) is the source of truth for what
 * moves are legal and who may make them.
 */

/** A listing is only editable by the merchant while in draft or changes-requested. */
function assertEditable(p: MerchantEventParticipation): void {
  if (p.approvalStatus !== "draft" && p.approvalStatus !== "changes_requested") {
    throw new AppError("CONFLICT", {
      message: "This listing can't be edited while it's under review or approved.",
    });
  }
}

// --- Organizer -------------------------------------------------------------

/** Adds a tenant merchant to one of the tenant's events, in `draft`. */
export async function addParticipation(
  ctx: TenantScopedContext,
  eventId: string,
  merchantId: string,
): Promise<MerchantEventParticipation> {
  const [event, merchant] = await Promise.all([
    findEventById(ctx.tenant.id, eventId),
    findMerchantById(ctx.tenant.id, merchantId),
  ]);
  if (!event) throw new AppError("EVENT_NOT_FOUND");
  if (!merchant) throw new AppError("MERCHANT_NOT_FOUND");

  const existing = await findParticipationByEventMerchant(ctx.tenant.id, eventId, merchantId);
  if (existing) {
    throw new AppError("CONFLICT", { message: "That merchant is already in this event." });
  }

  // Plan limit: merchants per event (§22).
  await assertWithinLimit(ctx.tenant.id, "merchants_per_event", { eventId });

  const participation = await insertParticipation({
    tenantId: ctx.tenant.id,
    eventId,
    merchantId,
    approvalStatus: "draft",
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.PARTICIPATION_ADDED,
    resourceType: "participation",
    resourceId: participation.id,
    after: { eventId, merchantId },
  });
  return participation;
}

/** Organizer verdict: approve / request changes / reject a submitted listing. */
export async function reviewParticipation(
  ctx: TenantScopedContext,
  participationId: string,
  to: ParticipationStatus,
  note?: string,
): Promise<MerchantEventParticipation> {
  if (actorForParticipationTransition(to) !== "organizer") {
    throw new AppError("VALIDATION_ERROR", { message: "That is not a review action." });
  }
  const participation = await findParticipationById(ctx.tenant.id, participationId);
  if (!participation) throw new AppError("NOT_FOUND", { message: "Participation not found." });

  if (!canTransitionParticipation(participation.approvalStatus, to)) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `A listing cannot move from ${participation.approvalStatus} to ${to}.`,
      details: { from: participation.approvalStatus, to },
    });
  }

  const updated = await updateParticipation(ctx.tenant.id, participationId, {
    approvalStatus: to,
    reviewedBy: ctx.user.id,
    reviewNote: to === "approved" ? null : (note?.trim() ?? null),
    ...(to === "approved" ? { approvedAt: new Date() } : {}),
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Participation not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.PARTICIPATION_STATUS_CHANGED,
    resourceType: "participation",
    resourceId: participationId,
    before: { status: participation.approvalStatus },
    after: { status: to },
  });
  ctx.log.info("participation.reviewed", {
    participationId,
    from: participation.approvalStatus,
    to,
  });
  return updated;
}

// --- Merchant --------------------------------------------------------------

async function requireOwnParticipation(
  ctx: MerchantScopedContext,
  participationId: string,
): Promise<MerchantEventParticipation> {
  const participation = await findParticipationForMerchant(ctx.merchant.id, participationId);
  if (!participation) throw new AppError("NOT_FOUND", { message: "Listing not found." });
  return participation;
}

/** Merchant edits the listing title/description (draft or changes-requested only). */
export async function updateListingAsMerchant(
  ctx: MerchantScopedContext,
  participationId: string,
  input: { listingTitle: string | null; listingDescription: string | null },
): Promise<MerchantEventParticipation> {
  const participation = await requireOwnParticipation(ctx, participationId);
  assertEditable(participation);

  const updated = await updateParticipationForMerchant(ctx.merchant.id, participationId, {
    listingTitle: input.listingTitle?.trim() || null,
    listingDescription: input.listingDescription?.trim() || null,
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Listing not found." });
  return updated;
}

/** Merchant status moves: submit, withdraw, or return to draft. */
export async function setParticipationStatusAsMerchant(
  ctx: MerchantScopedContext,
  participationId: string,
  to: ParticipationStatus,
): Promise<MerchantEventParticipation> {
  if (actorForParticipationTransition(to) !== "merchant") {
    throw new AppError("FORBIDDEN", { message: "Only an organizer can review a listing." });
  }
  const participation = await requireOwnParticipation(ctx, participationId);

  if (!canTransitionParticipation(participation.approvalStatus, to)) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `A listing cannot move from ${participation.approvalStatus} to ${to}.`,
      details: { from: participation.approvalStatus, to },
    });
  }

  // The submit gate: a listing needs a title before it can go for review.
  if (to === "submitted" && !participation.listingTitle?.trim()) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Add a listing title before submitting for review.",
    });
  }

  const updated = await updateParticipationForMerchant(ctx.merchant.id, participationId, {
    approvalStatus: to,
    ...(to === "submitted" ? { submittedAt: new Date() } : {}),
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Listing not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.PARTICIPATION_STATUS_CHANGED,
    resourceType: "participation",
    resourceId: participationId,
    tenantId: ctx.merchant.tenantId,
    before: { status: participation.approvalStatus },
    after: { status: to },
  });
  return updated;
}
