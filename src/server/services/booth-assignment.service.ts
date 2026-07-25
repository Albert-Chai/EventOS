import { AppError } from "@/lib/api/errors";
import type { MerchantScopedContext, TenantScopedContext } from "@/server/context";
import {
  findActiveAssignmentForBooth,
  findActiveAssignmentForParticipation,
  findAssignmentById,
  findAssignmentForMerchant,
  insertAssignment,
  updateAssignment,
  updateAssignmentForMerchant,
} from "@/server/db/repositories/booth-assignments.repository";
import { findBoothById, updateBooth } from "@/server/db/repositories/booths.repository";
import { findParticipationById } from "@/server/db/repositories/participations.repository";
import type { BoothAssignment } from "@/server/db/schema";
import {
  boothStatusForAssignment,
  canTransitionAssignment,
  isAssignableBoothStatus,
  type BoothStatus,
} from "@/server/booths/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * The booth ↔ merchant link (spec §7 step 7, §8.6). The organizer assigns a
 * participation to a booth and can cancel it (tenant-scoped, `booth.manage`); the
 * merchant confirms their own booth (membership-scoped). The booth's `status` is
 * kept in step with the assignment via `boothStatusForAssignment`.
 */

// --- Organizer -------------------------------------------------------------

export async function assignBooth(
  ctx: TenantScopedContext,
  input: { boothId: string; participationId: string; note?: string | null },
): Promise<BoothAssignment> {
  const booth = await findBoothById(ctx.tenant.id, input.boothId);
  if (!booth) throw new AppError("BOOTH_NOT_FOUND");

  const participation = await findParticipationById(ctx.tenant.id, input.participationId);
  if (!participation) throw new AppError("NOT_FOUND", { message: "Participation not found." });
  if (participation.eventId !== booth.eventId) {
    throw new AppError("VALIDATION_ERROR", {
      message: "That merchant is not part of this booth's event.",
    });
  }

  if (!isAssignableBoothStatus(booth.status)) {
    throw new AppError("BOOTH_NOT_ASSIGNABLE", { details: { status: booth.status } });
  }
  if (await findActiveAssignmentForBooth(ctx.tenant.id, input.boothId)) {
    throw new AppError("CONFLICT", { message: "That booth already has a merchant." });
  }
  if (await findActiveAssignmentForParticipation(ctx.tenant.id, input.participationId)) {
    throw new AppError("CONFLICT", {
      message: "That merchant is already assigned to a booth. Unassign it first.",
    });
  }

  const assignment = await insertAssignment({
    tenantId: ctx.tenant.id,
    eventId: booth.eventId,
    boothId: booth.id,
    participationId: participation.id,
    merchantId: participation.merchantId,
    status: "assigned",
    assignedBy: ctx.user.id,
    note: input.note?.trim() || null,
  });

  await updateBooth(ctx.tenant.id, booth.id, { status: boothStatusForAssignment("assigned") });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_ASSIGNED,
    resourceType: "booth_assignment",
    resourceId: assignment.id,
    after: { boothId: booth.id, participationId: participation.id },
  });
  return assignment;
}

export async function unassignBooth(ctx: TenantScopedContext, assignmentId: string): Promise<void> {
  const assignment = await findAssignmentById(ctx.tenant.id, assignmentId);
  if (!assignment) throw new AppError("NOT_FOUND", { message: "Assignment not found." });
  if (assignment.status === "cancelled") return;

  await updateAssignment(ctx.tenant.id, assignmentId, { status: "cancelled" });
  await updateBooth(ctx.tenant.id, assignment.boothId, {
    status: boothStatusForAssignment("cancelled") as BoothStatus,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_UNASSIGNED,
    resourceType: "booth_assignment",
    resourceId: assignmentId,
    before: { boothId: assignment.boothId, status: assignment.status },
  });
}

// --- Merchant --------------------------------------------------------------

/** The merchant confirms the booth the organizer assigned them (§7 step 7). */
export async function confirmBoothAsMerchant(
  ctx: MerchantScopedContext,
  assignmentId: string,
): Promise<BoothAssignment> {
  const assignment = await findAssignmentForMerchant(ctx.merchant.id, assignmentId);
  if (!assignment) throw new AppError("NOT_FOUND", { message: "Assignment not found." });

  if (!canTransitionAssignment(assignment.status, "confirmed")) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `A ${assignment.status} assignment can't be confirmed.`,
    });
  }

  const updated = await updateAssignmentForMerchant(ctx.merchant.id, assignmentId, {
    status: "confirmed",
    confirmedAt: new Date(),
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Assignment not found." });

  // Sync the booth status. The booth belongs to the merchant's tenant (the
  // event's tenant), so scoping the update by that tenant id is correct.
  await updateBooth(ctx.merchant.tenantId, assignment.boothId, {
    status: boothStatusForAssignment("confirmed"),
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_ASSIGNMENT_CONFIRMED,
    resourceType: "booth_assignment",
    resourceId: assignmentId,
    tenantId: ctx.merchant.tenantId,
    after: { boothId: assignment.boothId },
  });
  return updated;
}
