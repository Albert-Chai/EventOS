/**
 * Drizzle schema barrel.
 *
 * Phase 0: profiles.
 * Phase 1: the multi-tenant core — tenants, membership, roles, platform admins,
 * audit logs, impersonation. Every tenant-scoped table here carries `tenant_id`
 * (spec §5) and is reachable only through the repository layer.
 * Phase 2: events and their satellites — settings, branding, operating hours.
 */
export * from "./profiles";
export * from "./tenants";
export * from "./roles";
export * from "./members";
export * from "./platform";
export * from "./audit";
export * from "./impersonation";
export * from "./events";
export * from "./event-settings";
export * from "./event-branding";
export * from "./event-operating-hours";
