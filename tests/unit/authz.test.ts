import { describe, expect, it } from "vitest";

import { PERMISSIONS, isPermission } from "@/server/authz/permissions";
import {
  IMPERSONATION_PERMISSIONS,
  ROLES,
  ROLE_KEYS,
  isRoleKey,
  permissionsForRoles,
} from "@/server/authz/roles";

describe("permissions", () => {
  it("recognises defined permissions and rejects unknown ones", () => {
    expect(isPermission("tenant.manage_members")).toBe(true);
    expect(isPermission("tenant.destroy_everything")).toBe(false);
    expect(isPermission("")).toBe(false);
  });

  it("has no duplicate permission codes", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});

describe("role → permission map", () => {
  it("every role references only real permissions", () => {
    for (const key of ROLE_KEYS) {
      for (const permission of ROLES[key].permissions) {
        expect(isPermission(permission), `${key} → ${permission}`).toBe(true);
      }
    }
  });

  it("owner holds every permission", () => {
    const owner = new Set(ROLES.owner.permissions);
    for (const permission of PERMISSIONS) {
      expect(owner.has(permission), `owner missing ${permission}`).toBe(true);
    }
  });

  it("resolves a union across multiple roles", () => {
    // finance brings billing; marketing brings campaigns. Union has both.
    const perms = permissionsForRoles(["finance", "marketing"]);
    expect(perms.has("tenant.manage_billing")).toBe(true);
    expect(perms.has("campaign.manage")).toBe(true);
    // Neither grants member management — only owner does.
    expect(perms.has("tenant.manage_members")).toBe(false);
  });

  it("ignores unknown role keys instead of throwing", () => {
    const perms = permissionsForRoles(["finance", "not_a_role", ""]);
    expect(perms.has("tenant.manage_billing")).toBe(true);
  });

  it("grants nothing for an empty role list — the no-roles member", () => {
    expect(permissionsForRoles([]).size).toBe(0);
  });

  it("only the owner role can manage members and billing", () => {
    for (const key of ROLE_KEYS) {
      const perms = new Set(ROLES[key].permissions);
      if (key === "owner") continue;
      expect(perms.has("tenant.manage_members"), `${key}`).toBe(false);
    }
  });

  it("impersonation acts with the full owner permission set", () => {
    expect(IMPERSONATION_PERMISSIONS).toBe(ROLES.owner.permissions);
  });
});

describe("isRoleKey", () => {
  it("validates role keys", () => {
    expect(isRoleKey("owner")).toBe(true);
    expect(isRoleKey("event_manager")).toBe(true);
    expect(isRoleKey("superuser")).toBe(false);
  });
});
