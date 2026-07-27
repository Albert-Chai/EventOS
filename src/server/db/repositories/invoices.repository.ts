import { count, desc, eq, sum } from "drizzle-orm";

import { db } from "@/server/db";
import { invoices, tenants, type Invoice, type NewInvoice } from "@/server/db/schema";

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

// --- Platform-admin (cross-tenant) ----------------------------------------
//
// The reads below are **platform-admin only** and deliberately unscoped (the
// §3.2 platform-authority axis). Callers must gate with `requirePlatformAdmin`;
// they are never reachable from a tenant user's path.

/** Paid-invoice count + summed amount across all tenants (the simulated revenue). */
export async function platformInvoiceTotals(): Promise<{ paidCount: number; amountCents: number }> {
  const [row] = await db
    .select({ paidCount: count(), amountCents: sum(invoices.amountCents) })
    .from(invoices)
    .where(eq(invoices.status, "paid"));
  return { paidCount: row?.paidCount ?? 0, amountCents: Number(row?.amountCents ?? 0) };
}

export type InvoiceWithTenant = Invoice & { tenantName: string | null };

/** The most recent invoices across all tenants, joined to the tenant name. */
export async function listRecentInvoicesAcrossTenants(limit = 10): Promise<InvoiceWithTenant[]> {
  return db
    .select({
      id: invoices.id,
      tenantId: invoices.tenantId,
      subscriptionId: invoices.subscriptionId,
      planKey: invoices.planKey,
      number: invoices.number,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      status: invoices.status,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      issuedAt: invoices.issuedAt,
      paidAt: invoices.paidAt,
      externalRef: invoices.externalRef,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt,
      tenantName: tenants.name,
    })
    .from(invoices)
    .leftJoin(tenants, eq(tenants.id, invoices.tenantId))
    .orderBy(desc(invoices.issuedAt))
    .limit(Math.min(limit, 100));
}
