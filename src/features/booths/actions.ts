"use server";

import { revalidatePath } from "next/cache";

import { AppError, isAppError } from "@/lib/api/errors";
import { requirePermission } from "@/server/policies/require-user";
import { assignBooth, unassignBooth } from "@/server/services/booth-assignment.service";
import {
  createBooth,
  editBooth,
  moveBooth,
  removeBooth,
  setBoothStatus,
} from "@/server/services/booth.service";
import {
  createFloor,
  removeFloor,
  removeFloorImage,
  renameFloor,
  setFloorImage,
} from "@/server/services/map.service";
import { createZone, editZone, removeZone } from "@/server/services/zone.service";
import { parseImageChange } from "@/server/services/entity-media.service";
import { isBoothStatus } from "@/server/booths/status";

import {
  assignBoothSchema,
  boothSchema,
  boothStatusSchema,
  floorSchema,
  moveBoothSchema,
  zoneSchema,
} from "./schemas";
import type { BoothFormState } from "./state";

/**
 * Organizer booth/zone/map actions. Zones and booths are gated by
 * `booth.manage`; floors and floor images by `map.manage`. The UI is never the
 * access control (§14) — every action re-checks.
 */

function errorState(error: unknown): BoothFormState {
  if (isAppError(error) || error instanceof AppError) {
    return { status: "error", message: error.message, fieldErrors: undefined };
  }
  return { status: "error", message: "Something went wrong. Please try again." };
}

function boothsPath(eventId: string): string {
  return `/dashboard/events/${eventId}/booths`;
}
function mapPath(eventId: string): string {
  return `/dashboard/events/${eventId}/map`;
}
function zonesPath(eventId: string): string {
  return `/dashboard/events/${eventId}/zones`;
}

// --- Zones -----------------------------------------------------------------

export async function createZoneAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const ctx = await requirePermission("booth.manage");
    await createZone(ctx, eventId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? null,
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(zonesPath(eventId));
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Zone saved." };
}

export async function updateZoneAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const zoneId = formData.get("zoneId")?.toString() ?? "";
  const parsed = zoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const ctx = await requirePermission("booth.manage");
    await editZone(ctx, zoneId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? null,
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(zonesPath(eventId));
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Zone saved." };
}

export async function deleteZoneAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const zoneId = formData.get("zoneId")?.toString() ?? "";
  const ctx = await requirePermission("booth.manage");
  await removeZone(ctx, zoneId);
  revalidatePath(zonesPath(eventId));
  revalidatePath(boothsPath(eventId));
}

// --- Map floors ------------------------------------------------------------

export async function createFloorAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = floorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Give the floor a name." };
  }
  try {
    const ctx = await requirePermission("map.manage");
    await createFloor(ctx, eventId, parsed.data.name);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(mapPath(eventId));
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Floor added." };
}

export async function updateFloorAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const floorId = formData.get("floorId")?.toString() ?? "";
  const name = formData.get("name")?.toString() ?? "";
  const image = parseImageChange(formData, "image");
  try {
    const ctx = await requirePermission("map.manage");
    if (name.trim()) await renameFloor(ctx, floorId, name);
    if (image) {
      if ("remove" in image) await removeFloorImage(ctx, floorId);
      else
        await setFloorImage(ctx, floorId, image.file, { width: image.width, height: image.height });
    }
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(mapPath(eventId));
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Floor saved." };
}

export async function deleteFloorAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const floorId = formData.get("floorId")?.toString() ?? "";
  const ctx = await requirePermission("map.manage");
  await removeFloor(ctx, floorId);
  revalidatePath(mapPath(eventId));
  revalidatePath(boothsPath(eventId));
}

// --- Booths ----------------------------------------------------------------

export async function createBoothAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = boothSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const ctx = await requirePermission("booth.manage");
    await createBooth(ctx, eventId, {
      boothNumber: parsed.data.boothNumber,
      name: parsed.data.name ?? null,
      zoneId: parsed.data.zoneId ?? null,
      mapFloorId: parsed.data.mapFloorId ?? null,
      x: parsed.data.x ?? 0.5,
      y: parsed.data.y ?? 0.5,
      width: parsed.data.width ?? 0.08,
      height: parsed.data.height ?? 0.08,
      rotation: parsed.data.rotation ?? 0,
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Booth added." };
}

export async function updateBoothAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const boothId = formData.get("boothId")?.toString() ?? "";
  const parsed = boothSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const ctx = await requirePermission("booth.manage");
    await editBooth(ctx, boothId, {
      boothNumber: parsed.data.boothNumber,
      name: parsed.data.name ?? null,
      zoneId: parsed.data.zoneId ?? null,
      mapFloorId: parsed.data.mapFloorId ?? null,
      x: parsed.data.x ?? 0.5,
      y: parsed.data.y ?? 0.5,
      width: parsed.data.width ?? 0.08,
      height: parsed.data.height ?? 0.08,
      rotation: parsed.data.rotation ?? 0,
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Booth saved." };
}

/** Position-only save from the coordinate editor. Returns a plain status. */
export async function moveBoothAction(input: {
  eventId: string;
  boothId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}): Promise<{ ok: boolean; message?: string }> {
  const parsed = moveBoothSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid position." };
  try {
    const ctx = await requirePermission("booth.manage");
    await moveBooth(ctx, input.boothId, parsed.data);
  } catch (error) {
    const e = errorState(error);
    return { ok: false, message: e.message };
  }
  revalidatePath(boothsPath(input.eventId));
  return { ok: true };
}

export async function setBoothStatusAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const boothId = formData.get("boothId")?.toString() ?? "";
  const parsed = boothStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isBoothStatus(parsed.data.status)) return;
  const ctx = await requirePermission("booth.manage");
  await setBoothStatus(ctx, boothId, parsed.data.status);
  revalidatePath(boothsPath(eventId));
}

export async function deleteBoothAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const boothId = formData.get("boothId")?.toString() ?? "";
  const ctx = await requirePermission("booth.manage");
  await removeBooth(ctx, boothId);
  revalidatePath(boothsPath(eventId));
}

// --- Assignment ------------------------------------------------------------

export async function assignBoothAction(
  _prev: BoothFormState,
  formData: FormData,
): Promise<BoothFormState> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const parsed = assignBoothSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Pick a booth and a merchant." };
  }
  try {
    const ctx = await requirePermission("booth.manage");
    await assignBooth(ctx, {
      boothId: parsed.data.boothId,
      participationId: parsed.data.participationId,
      note: parsed.data.note ?? null,
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(boothsPath(eventId));
  return { status: "success", message: "Merchant assigned." };
}

export async function unassignBoothAction(formData: FormData): Promise<void> {
  const eventId = formData.get("eventId")?.toString() ?? "";
  const assignmentId = formData.get("assignmentId")?.toString() ?? "";
  const ctx = await requirePermission("booth.manage");
  await unassignBooth(ctx, assignmentId);
  revalidatePath(boothsPath(eventId));
}
