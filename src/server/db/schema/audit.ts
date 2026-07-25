import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { primaryId } from "./_shared";

/**
 * Audit log (spec §23).
 *
 * Append-only: rows are never updated or deleted (enforced by revoking those
 * grants in the migration). `actor_user_id` is always the real acting user —
 * during impersonation that is the platform admin, with `via_impersonation` set,
 * so a support action is never mistaken for the tenant's own.
 *
 * `tenant_id` is nullable: platform-level actions (grant admin, create tenant)
 * are not scoped to a tenant.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryId(),
    actorUserId: uuid("actor_user_id"),
    tenantId: uuid("tenant_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    viaImpersonation: boolean("via_impersonation").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
