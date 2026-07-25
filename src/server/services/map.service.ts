import { AppError } from "@/lib/api/errors";
import type { TenantScopedContext } from "@/server/context";
import { findEventById } from "@/server/db/repositories/events.repository";
import {
  deleteMapFloor,
  findFirstMapForEvent,
  findMapFloorById,
  insertMap,
  insertMapFloor,
  updateMapFloor,
} from "@/server/db/repositories/maps.repository";
import type { EventMap, MapFloor } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { removeFile, uploadImage } from "./media.service";

/**
 * Map + floor management (spec §8.6). Organizer-only, tenant-scoped, gated by
 * `map.manage`. An event has one auto-created default map; floors hang off it,
 * each with an uploaded floor-plan image (the media pass). Booth coordinates are
 * normalized, so the image's natural dimensions are metadata, not a dependency.
 */

/** Finds the event's default map, creating it on first use. */
export async function ensureDefaultMap(
  ctx: TenantScopedContext,
  eventId: string,
): Promise<EventMap> {
  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) throw new AppError("EVENT_NOT_FOUND");

  const existing = await findFirstMapForEvent(ctx.tenant.id, eventId);
  if (existing) return existing;

  return insertMap({ tenantId: ctx.tenant.id, eventId, name: "Event map" });
}

export async function createFloor(
  ctx: TenantScopedContext,
  eventId: string,
  name: string,
): Promise<MapFloor> {
  const map = await ensureDefaultMap(ctx, eventId);

  const floor = await insertMapFloor({
    tenantId: ctx.tenant.id,
    eventId,
    mapId: map.id,
    name: name.trim() || "Floor",
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MAP_FLOOR_CREATED,
    resourceType: "map_floor",
    resourceId: floor.id,
    after: { eventId, name: floor.name },
  });
  return floor;
}

export async function renameFloor(
  ctx: TenantScopedContext,
  floorId: string,
  name: string,
): Promise<MapFloor> {
  const existing = await findMapFloorById(ctx.tenant.id, floorId);
  if (!existing) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  const updated = await updateMapFloor(ctx.tenant.id, floorId, { name: name.trim() || "Floor" });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MAP_FLOOR_UPDATED,
    resourceType: "map_floor",
    resourceId: floorId,
    before: { name: existing.name },
    after: { name: updated.name },
  });
  return updated;
}

/** Uploads (or replaces) a floor's plan image. Old image is removed after swap. */
export async function setFloorImage(
  ctx: TenantScopedContext,
  floorId: string,
  file: File,
  dims: { width: number | null; height: number | null },
): Promise<MapFloor> {
  const floor = await findMapFloorById(ctx.tenant.id, floorId);
  if (!floor) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  const record = await uploadImage(ctx, {
    tenantId: ctx.tenant.id,
    scope: `events/${floor.eventId}/maps`,
    ownerId: floor.id,
    kind: "map_floor",
    file,
    width: dims.width,
    height: dims.height,
  });

  const updated = await updateMapFloor(ctx.tenant.id, floorId, {
    imageFileId: record.id,
    imageWidth: dims.width,
    imageHeight: dims.height,
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  // Best-effort removal of the previous image, now unreferenced.
  if (floor.imageFileId) await removeFile(ctx, ctx.tenant.id, floor.imageFileId);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MAP_FLOOR_UPDATED,
    resourceType: "map_floor",
    resourceId: floorId,
    after: { image: true },
  });
  return updated;
}

export async function removeFloorImage(
  ctx: TenantScopedContext,
  floorId: string,
): Promise<MapFloor> {
  const floor = await findMapFloorById(ctx.tenant.id, floorId);
  if (!floor) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  const updated = await updateMapFloor(ctx.tenant.id, floorId, {
    imageFileId: null,
    imageWidth: null,
    imageHeight: null,
  });
  if (floor.imageFileId) await removeFile(ctx, ctx.tenant.id, floor.imageFileId);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MAP_FLOOR_UPDATED,
    resourceType: "map_floor",
    resourceId: floorId,
    after: { image: false },
  });
  return updated!;
}

export async function removeFloor(ctx: TenantScopedContext, floorId: string): Promise<void> {
  const floor = await findMapFloorById(ctx.tenant.id, floorId);
  if (!floor) throw new AppError("NOT_FOUND", { message: "Floor not found." });

  await deleteMapFloor(ctx.tenant.id, floorId);
  if (floor.imageFileId) await removeFile(ctx, ctx.tenant.id, floor.imageFileId);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MAP_FLOOR_DELETED,
    resourceType: "map_floor",
    resourceId: floorId,
    before: { name: floor.name },
  });
}
