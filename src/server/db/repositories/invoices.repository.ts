import { count, desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { invoices, type Invoice, type NewInvoice } from "@/server/db/schema";

/**
 * Invoice records (spec §22). Tenant-scoped, newest-first for the billing history.
 * Written by `billing.service` on a (simulated) plan change; the amount/plan are
 * snapshotted on the row so a later price edit never rewrites past invoices.
 */

export async function insertInvoice(input: NewInvoice): Promise<Invoice> {
  const [row] = await db.insert(invoices).values(input).returning();
  return row;
}

export async function listInvoicesForTenant(tenantId: string): Promise<Invoice[]> {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId))
    .orderBy(desc(invoices.issuedAt));
}

/** Count of a tenant's invoices — used to make the next sequential invoice number. */
export async function countInvoicesForTenant(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId));
  return row?.value ?? 0;
}
