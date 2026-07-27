import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { qrCodes, type NewQrCode, type QrCode } from "@/server/db/schema";
import type { QrTargetType } from "@/server/analytics/taxonomy";

/**
 * QR codes (spec §8.10). The lookup by `short_code` is the one un-scoped read —
 * the code *is* the capability, exactly like resolving a public event by slug —
 * and the row carries its own `tenant_id`, so the scan write is still scoped by a
 * server-derived tenant, never a client value. Everything else is tenant-scoped.
 */

export async function insertQrCode(row: NewQrCode): Promise<QrCode> {
  const [created] = await db.insert(qrCodes).values(row).returning();
  return created!;
}

/** Resolves a code by its short code (any state); the service filters active/expiry. */
export async function findQrCodeByShortCode(shortCode: string): Promise<QrCode | null> {
  const [row] = await db.select().from(qrCodes).where(eq(qrCodes.shortCode, shortCode)).limit(1);
  return row ?? null;
}

/** The current active code for a target, for idempotent get-or-create. */
export async function findActiveQrCodeForTarget(
  tenantId: string,
  targetType: QrTargetType,
  targetId: string,
): Promise<QrCode | null> {
  const [row] = await db
    .select()
    .from(qrCodes)
    .where(
      and(
        eq(qrCodes.tenantId, tenantId),
        eq(qrCodes.targetType, targetType),
        eq(qrCodes.targetId, targetId),
        eq(qrCodes.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Bumps the denormalized scan counter (the ledger stays authoritative). */
export async function incrementQrScanCount(id: string): Promise<void> {
  await db
    .update(qrCodes)
    .set({ scanCount: sql`${qrCodes.scanCount} + 1` })
    .where(eq(qrCodes.id, id));
}
