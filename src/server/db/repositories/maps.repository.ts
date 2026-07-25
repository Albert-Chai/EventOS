import { and, asc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  files,
  mapFloors,
  maps,
  type EventMap,
  type MapFloor,
  type NewEventMap,
  type NewMapFloor,
} from "@/server/db/schema";

/**
 * Maps and their floors (spec §8.6). An event has one auto-created default map
 * (see `map.service.ensureDefaultMap`); floors hang off it, each with an uploaded
 * image. Organizer reads are tenant-scoped; the public map read joins the image
 * file so the caller can build a public URL without a second round trip.
 */

// --- Maps ------------------------------------------------------------------

export async function findFirstMapForEvent(
  tenantId: string,
  eventId: string,
): Promise<EventMap | null> {
  const [row] = await db
    .select()
    .from(maps)
    .where(and(eq(maps.tenantId, tenantId), eq(maps.eventId, eventId)))
    .orderBy(asc(maps.displayOrder), asc(maps.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertMap(input: NewEventMap): Promise<EventMap> {
  const [row] = await db.insert(maps).values(input).returning();
  return row;
}

// --- Floors (organizer, tenant-scoped) ------------------------------------

export type MapFloorRow = MapFloor & {
  imageBucket: string | null;
  imagePath: string | null;
};

function floorColumns() {
  return {
    id: mapFloors.id,
    tenantId: mapFloors.tenantId,
    eventId: mapFloors.eventId,
    mapId: mapFloors.mapId,
    name: mapFloors.name,
    imageFileId: mapFloors.imageFileId,
    imageWidth: mapFloors.imageWidth,
    imageHeight: mapFloors.imageHeight,
    displayOrder: mapFloors.displayOrder,
    createdAt: mapFloors.createdAt,
    updatedAt: mapFloors.updatedAt,
    imageBucket: files.bucket,
    imagePath: files.path,
  };
}

export async function listMapFloorsForEvent(
  tenantId: string,
  eventId: string,
): Promise<MapFloorRow[]> {
  return db
    .select(floorColumns())
    .from(mapFloors)
    .leftJoin(files, eq(files.id, mapFloors.imageFileId))
    .where(and(eq(mapFloors.tenantId, tenantId), eq(mapFloors.eventId, eventId)))
    .orderBy(asc(mapFloors.displayOrder), asc(mapFloors.name));
}

export async function findMapFloorById(tenantId: string, id: string): Promise<MapFloor | null> {
  const [row] = await db
    .select()
    .from(mapFloors)
    .where(and(eq(mapFloors.id, id), eq(mapFloors.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

export async function insertMapFloor(input: NewMapFloor): Promise<MapFloor> {
  const [row] = await db.insert(mapFloors).values(input).returning();
  return row;
}

export async function updateMapFloor(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<MapFloor, "name" | "imageFileId" | "imageWidth" | "imageHeight" | "displayOrder">
  >,
): Promise<MapFloor | null> {
  const [row] = await db
    .update(mapFloors)
    .set(patch)
    .where(and(eq(mapFloors.id, id), eq(mapFloors.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function deleteMapFloor(tenantId: string, id: string): Promise<MapFloor | null> {
  const [row] = await db
    .delete(mapFloors)
    .where(and(eq(mapFloors.id, id), eq(mapFloors.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

// --- Public (anonymous visitor) -------------------------------------------

export type PublicMapFloor = {
  id: string;
  name: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageBucket: string | null;
  imagePath: string | null;
};

/** Floors for the public map, with the image object's bucket+path joined. */
export async function listMapFloorsForEventPublic(eventId: string): Promise<PublicMapFloor[]> {
  const rows = await db
    .select({
      id: mapFloors.id,
      name: mapFloors.name,
      imageWidth: mapFloors.imageWidth,
      imageHeight: mapFloors.imageHeight,
      imageBucket: files.bucket,
      imagePath: files.path,
    })
    .from(mapFloors)
    .leftJoin(files, eq(files.id, mapFloors.imageFileId))
    .where(eq(mapFloors.eventId, eventId))
    .orderBy(asc(mapFloors.displayOrder), asc(mapFloors.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    imageUrl: null, // filled by the service with publicFileUrl (keeps URL-building out of the repo)
    imageWidth: r.imageWidth,
    imageHeight: r.imageHeight,
    imageBucket: r.imageBucket,
    imagePath: r.imagePath,
  }));
}
