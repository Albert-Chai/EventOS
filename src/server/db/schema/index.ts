/**
 * Drizzle schema barrel.
 *
 * Phase 0 has one table. Phase 1 adds tenants, memberships, roles, permissions,
 * and audit_logs; every tenant-scoped table added from then on carries a
 * `tenant_id` column (spec §5) — no exceptions.
 */
export * from "./profiles";
