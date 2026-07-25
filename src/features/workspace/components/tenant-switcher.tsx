"use client";

import { useRef } from "react";

import type { TenantContext, TenantSummary } from "@/server/context";

import { switchTenantAction } from "../actions";

/**
 * Workspace switcher. A styled native select that submits the switch action on
 * change — robust, keyboard-accessible, and no menu-primitive edge cases.
 * Hidden when the user belongs to only one workspace.
 */
export function TenantSwitcher({
  active,
  memberships,
}: {
  active: TenantContext;
  memberships: readonly TenantSummary[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (memberships.length <= 1) {
    return <span className="text-sm font-medium">{active.name}</span>;
  }

  return (
    <form action={switchTenantAction} ref={formRef}>
      <label className="sr-only" htmlFor="tenant-switcher">
        Switch workspace
      </label>
      <select
        id="tenant-switcher"
        name="tenantId"
        defaultValue={active.id}
        onChange={() => formRef.current?.requestSubmit()}
        className="border-input bg-background focus-visible:ring-ring h-8 max-w-48 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.id}>
            {membership.name}
          </option>
        ))}
      </select>
    </form>
  );
}
