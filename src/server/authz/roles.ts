import { PERMISSIONS, type Permission } from "./permissions";

/**
 * System roles (spec §4.3) and their permission sets.
 *
 * These `role_key`s are seeded into the `roles` table (see the 0003 migration);
 * `tenant_member_roles` references them. This map is the runtime source of
 * truth for what each role can do — the database stores *which* roles a member
 * has, this decides *what those roles mean*.
 *
 * A member's effective permissions are the union across all their roles.
 */

export const ROLE_KEYS = [
  "owner",
  "event_manager",
  "merchant_manager",
  "marketing",
  "finance",
  "checker",
  "support",
  "analyst",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export type RoleDefinition = {
  key: RoleKey;
  name: string;
  description: string;
  sortOrder: number;
  permissions: readonly Permission[];
};

/** Everything — used by `owner`. */
const ALL: readonly Permission[] = PERMISSIONS;

export const ROLES: Record<RoleKey, RoleDefinition> = {
  owner: {
    key: "owner",
    name: "Owner",
    description: "Full control of the organizer workspace, including billing and members.",
    sortOrder: 0,
    permissions: ALL,
  },
  event_manager: {
    key: "event_manager",
    name: "Event Manager",
    description: "Creates and runs events, booths, and maps; reviews merchants.",
    sortOrder: 1,
    permissions: [
      "tenant.view",
      "event.create",
      "event.view",
      "event.update",
      "event.publish",
      "event.archive",
      "booth.manage",
      "map.manage",
      "merchant.view",
      "merchant.approve",
      "merchant.reject",
      "merchant.feature",
      "sponsor.manage",
      "analytics.view",
      "settings.manage",
    ],
  },
  merchant_manager: {
    key: "merchant_manager",
    name: "Merchant Manager",
    description: "Onboards and manages merchants and their listings.",
    sortOrder: 2,
    permissions: [
      "tenant.view",
      "event.view",
      "merchant.create",
      "merchant.view",
      "merchant.update",
      "merchant.approve",
      "merchant.reject",
      "analytics.view",
    ],
  },
  marketing: {
    key: "marketing",
    name: "Marketing",
    description: "Runs campaigns, vouchers, and featured placements.",
    sortOrder: 3,
    permissions: [
      "tenant.view",
      "event.view",
      "merchant.view",
      "merchant.feature",
      "voucher.manage",
      "campaign.manage",
      "analytics.view",
    ],
  },
  finance: {
    key: "finance",
    name: "Finance",
    description: "Manages billing and exports financial and engagement reports.",
    sortOrder: 4,
    permissions: [
      "tenant.view",
      "tenant.manage_billing",
      "event.view",
      "analytics.view",
      "analytics.export",
    ],
  },
  checker: {
    key: "checker",
    name: "Checker",
    description: "Validates and redeems vouchers on-site.",
    sortOrder: 5,
    permissions: ["tenant.view", "event.view", "voucher.redeem"],
  },
  support: {
    key: "support",
    name: "Support",
    description: "Read access across the workspace to assist users.",
    sortOrder: 6,
    permissions: ["tenant.view", "event.view", "merchant.view", "analytics.view"],
  },
  analyst: {
    key: "analyst",
    name: "Read-only Analyst",
    description: "Views and exports analytics only.",
    sortOrder: 7,
    permissions: ["tenant.view", "event.view", "analytics.view", "analytics.export"],
  },
};

export const ROLE_LIST: readonly RoleDefinition[] = ROLE_KEYS.map((key) => ROLES[key]);

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

/** Union of permissions across the given roles. Unknown keys are ignored. */
export function permissionsForRoles(roleKeys: readonly string[]): ReadonlySet<Permission> {
  const set = new Set<Permission>();
  for (const key of roleKeys) {
    if (isRoleKey(key)) {
      for (const permission of ROLES[key].permissions) set.add(permission);
    }
  }
  return set;
}

/** The permission set a platform admin holds while impersonating a tenant. */
export const IMPERSONATION_PERMISSIONS = ROLES.owner.permissions;
