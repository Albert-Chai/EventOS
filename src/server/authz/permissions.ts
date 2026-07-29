/**
 * Permissions — the source of truth for tenant-level authorization (spec §14).
 *
 * Per the Phase 1 decision, permissions live in code (a union), not in the
 * database. The `permissions` / `role_permissions` tables from the schema
 * sketch (§12) are deliberately NOT created: they would duplicate this map and
 * drift out of sync. `roles` and `tenant_member_roles` DO exist in the database
 * — a member is assigned roles, and this module resolves those roles to the
 * permission set carried on `ctx.permissions`.
 *
 * Codes are a contract: additive only, never renamed once shipped.
 *
 * NOTE ON PHASE: most of these permissions gate features that do not exist yet
 * (events, merchants, booths, vouchers). They are defined now so the role map
 * is complete and stable; only the tenant/settings/audit permissions are
 * actually enforced in Phase 1. Each later phase wires enforcement for its own.
 */
export const PERMISSIONS = [
  // Tenant
  "tenant.view",
  "tenant.update",
  "tenant.manage_billing",
  "tenant.manage_members",

  // Events (Phase 2)
  "event.create",
  "event.view",
  "event.update",
  "event.publish",
  "event.archive",
  "event.delete",

  // Merchants (Phase 3)
  "merchant.create",
  "merchant.view",
  "merchant.update",
  "merchant.approve",
  "merchant.reject",
  "merchant.delete",
  "merchant.feature",

  // Operations (Phases 4, 6, 8)
  "booth.manage",
  "map.manage",
  "sponsor.manage",
  "voucher.manage",
  "voucher.redeem",
  "campaign.manage",
  "moment.moderate",

  // Cross-cutting
  "analytics.view",
  "analytics.export",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<Permission>(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value as Permission);
}
