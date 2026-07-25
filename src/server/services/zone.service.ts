import { AppError } from "@/lib/api/errors";
import type { TenantScopedContext } from "@/server/context";
import { findEventById } from "@/server/db/repositories/events.repository";
import {
  deleteZone,
  findZoneById,
  insertZone,
  updateZone,
} from "@/server/db/repositories/zones.repository";
import type { Zone } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Zone management (spec §8.6). Organizer-only, tenant-scoped: every read/write
 * derives `tenant_id` from `ctx.tenant.id`, and a cross-tenant event or zone id
 * is simply not found. Gated by `booth.manage` in the action layer.
 */

type ZoneInput = {
  name: string;
  description: string | null;
  color: string | null;
  displayOrder?: number;
};

async function assertEvent(ctx: TenantScopedContext, eventId: string): Promise<void> {
  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) throw new AppError("EVENT_NOT_FOUND");
}

export async function createZone(
  ctx: TenantScopedContext,
  eventId: string,
  input: ZoneInput,
): Promise<Zone> {
  await assertEvent(ctx, eventId);

  const zone = await insertZone({
    tenantId: ctx.tenant.id,
    eventId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color: input.color?.trim() || null,
    displayOrder: input.displayOrder ?? 0,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.ZONE_CREATED,
    resourceType: "zone",
    resourceId: zone.id,
    after: { eventId, name: zone.name },
  });
  return zone;
}

export async function editZone(
  ctx: TenantScopedContext,
  zoneId: string,
  input: ZoneInput,
): Promise<Zone> {
  const existing = await findZoneById(ctx.tenant.id, zoneId);
  if (!existing) throw new AppError("NOT_FOUND", { message: "Zone not found." });

  const updated = await updateZone(ctx.tenant.id, zoneId, {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    color: input.color?.trim() || null,
    ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
  });
  if (!updated) throw new AppError("NOT_FOUND", { message: "Zone not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.ZONE_UPDATED,
    resourceType: "zone",
    resourceId: zoneId,
    before: { name: existing.name },
    after: { name: updated.name },
  });
  return updated;
}

export async function removeZone(ctx: TenantScopedContext, zoneId: string): Promise<void> {
  const removed = await deleteZone(ctx.tenant.id, zoneId);
  if (!removed) throw new AppError("NOT_FOUND", { message: "Zone not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.ZONE_DELETED,
    resourceType: "zone",
    resourceId: zoneId,
    before: { name: removed.name },
  });
}
