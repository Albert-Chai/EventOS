import { AppError } from "@/lib/api/errors";
import type { TenantScopedContext } from "@/server/context";
import { findActiveAssignmentForBooth } from "@/server/db/repositories/booth-assignments.repository";
import {
  boothNumberExists,
  deleteBooth,
  findBoothById,
  insertBooth,
  updateBooth,
} from "@/server/db/repositories/booths.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { findMapFloorById } from "@/server/db/repositories/maps.repository";
import { findZoneById } from "@/server/db/repositories/zones.repository";
import type { Booth } from "@/server/db/schema";
import { isOrganizerSettableBoothStatus, type BoothStatus } from "@/server/booths/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Booth management (spec §8.6). Organizer-only, tenant-scoped, gated by
 * `booth.manage`. Coordinates are normalized 0..1 and clamped here so a bad
 * client value can never place a booth off the floor. `status` is driven by the
 * assignment flow (`booth-assignment.service.ts`); this service only lets an
 * organizer set the *manual* statuses, and only when no assignment is active.
 */

type Geometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type BoothInput = Geometry & {
  boothNumber: string;
  name: string | null;
  zoneId: string | null;
  mapFloorId: string | null;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

function normalizeGeometry(g: Geometry): Geometry {
  const width = Math.min(1, Math.max(0.01, Number.isFinite(g.width) ? g.width : 0.06));
  const height = Math.min(1, Math.max(0.01, Number.isFinite(g.height) ? g.height : 0.06));
  return {
    x: clamp01(g.x),
    y: clamp01(g.y),
    width,
    height,
    rotation: Number.isFinite(g.rotation) ? ((g.rotation % 360) + 360) % 360 : 0,
  };
}

/** Validates that an optional zone / floor belongs to this tenant and event. */
async function assertZoneAndFloor(
  ctx: TenantScopedContext,
  eventId: string,
  zoneId: string | null,
  mapFloorId: string | null,
): Promise<void> {
  if (zoneId) {
    const zone = await findZoneById(ctx.tenant.id, zoneId);
    if (!zone || zone.eventId !== eventId) {
      throw new AppError("VALIDATION_ERROR", { message: "That zone is not part of this event." });
    }
  }
  if (mapFloorId) {
    const floor = await findMapFloorById(ctx.tenant.id, mapFloorId);
    if (!floor || floor.eventId !== eventId) {
      throw new AppError("VALIDATION_ERROR", { message: "That floor is not part of this event." });
    }
  }
}

export async function createBooth(
  ctx: TenantScopedContext,
  eventId: string,
  input: BoothInput,
): Promise<Booth> {
  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) throw new AppError("EVENT_NOT_FOUND");

  const boothNumber = input.boothNumber.trim();
  if (!boothNumber) {
    throw new AppError("VALIDATION_ERROR", { message: "A booth number is required." });
  }
  if (await boothNumberExists(ctx.tenant.id, eventId, boothNumber)) {
    throw new AppError("BOOTH_NUMBER_TAKEN", { details: { boothNumber } });
  }
  await assertZoneAndFloor(ctx, eventId, input.zoneId, input.mapFloorId);

  const geo = normalizeGeometry(input);
  const booth = await insertBooth({
    tenantId: ctx.tenant.id,
    eventId,
    zoneId: input.zoneId,
    mapFloorId: input.mapFloorId,
    boothNumber,
    name: input.name?.trim() || null,
    ...geo,
    status: "available",
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_CREATED,
    resourceType: "booth",
    resourceId: booth.id,
    after: { eventId, boothNumber },
  });
  return booth;
}

export async function editBooth(
  ctx: TenantScopedContext,
  boothId: string,
  input: BoothInput,
): Promise<Booth> {
  const existing = await findBoothById(ctx.tenant.id, boothId);
  if (!existing) throw new AppError("BOOTH_NOT_FOUND");

  const boothNumber = input.boothNumber.trim();
  if (!boothNumber) {
    throw new AppError("VALIDATION_ERROR", { message: "A booth number is required." });
  }
  if (await boothNumberExists(ctx.tenant.id, existing.eventId, boothNumber, boothId)) {
    throw new AppError("BOOTH_NUMBER_TAKEN", { details: { boothNumber } });
  }
  await assertZoneAndFloor(ctx, existing.eventId, input.zoneId, input.mapFloorId);

  const geo = normalizeGeometry(input);
  const updated = await updateBooth(ctx.tenant.id, boothId, {
    boothNumber,
    name: input.name?.trim() || null,
    zoneId: input.zoneId,
    mapFloorId: input.mapFloorId,
    ...geo,
  });
  if (!updated) throw new AppError("BOOTH_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_UPDATED,
    resourceType: "booth",
    resourceId: boothId,
    after: { boothNumber },
  });
  return updated;
}

/** Position/size-only update (the coordinate editor's drag save). */
export async function moveBooth(
  ctx: TenantScopedContext,
  boothId: string,
  geometry: Geometry,
): Promise<Booth> {
  const existing = await findBoothById(ctx.tenant.id, boothId);
  if (!existing) throw new AppError("BOOTH_NOT_FOUND");

  const updated = await updateBooth(ctx.tenant.id, boothId, normalizeGeometry(geometry));
  if (!updated) throw new AppError("BOOTH_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_UPDATED,
    resourceType: "booth",
    resourceId: boothId,
    after: { moved: true },
  });
  return updated;
}

export async function setBoothStatus(
  ctx: TenantScopedContext,
  boothId: string,
  status: BoothStatus,
): Promise<Booth> {
  if (!isOrganizerSettableBoothStatus(status)) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Assigned and confirmed are set by the assignment flow, not directly.",
    });
  }
  const existing = await findBoothById(ctx.tenant.id, boothId);
  if (!existing) throw new AppError("BOOTH_NOT_FOUND");

  const active = await findActiveAssignmentForBooth(ctx.tenant.id, boothId);
  if (active) {
    throw new AppError("CONFLICT", {
      message: "Unassign the merchant before changing this booth's status.",
    });
  }

  const updated = await updateBooth(ctx.tenant.id, boothId, { status });
  if (!updated) throw new AppError("BOOTH_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_STATUS_CHANGED,
    resourceType: "booth",
    resourceId: boothId,
    before: { status: existing.status },
    after: { status },
  });
  return updated;
}

export async function removeBooth(ctx: TenantScopedContext, boothId: string): Promise<void> {
  const removed = await deleteBooth(ctx.tenant.id, boothId);
  if (!removed) throw new AppError("BOOTH_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.BOOTH_DELETED,
    resourceType: "booth",
    resourceId: boothId,
    before: { boothNumber: removed.boothNumber },
  });
}
