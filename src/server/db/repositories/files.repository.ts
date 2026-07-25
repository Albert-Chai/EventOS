import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { files, type FileRecord, type NewFileRecord } from "@/server/db/schema";

/**
 * The `files` media record. Tenant-scoped like every other domain table: reads
 * and writes carry a `tenant_id` derived from context, never a client value.
 * The Storage object itself is handled in `src/server/media/storage.ts`.
 */

export async function insertFile(input: NewFileRecord): Promise<FileRecord> {
  const [row] = await db.insert(files).values(input).returning();
  return row;
}

export async function findFileById(tenantId: string, id: string): Promise<FileRecord | null> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

/** Batch lookup for list views that render many images at once. */
export async function listFilesByIds(
  tenantId: string,
  ids: readonly string[],
): Promise<FileRecord[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(files)
    .where(and(eq(files.tenantId, tenantId), inArray(files.id, [...ids])));
}

export async function deleteFileRow(tenantId: string, id: string): Promise<FileRecord | null> {
  const [row] = await db
    .delete(files)
    .where(and(eq(files.id, id), eq(files.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

/** Total bytes stored by a tenant — the `storage_bytes` plan limit (§22). */
export async function sumStorageBytesForTenant(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
    .from(files)
    .where(eq(files.tenantId, tenantId));
  return Number(row?.value ?? 0);
}
