import Link from "next/link";

import type { Permission } from "@/server/authz/permissions";
import { cn } from "@/lib/utils";

/**
 * Organizer dashboard navigation (spec §18). Items are permission-gated — but
 * this only *hides* links; the pages themselves re-check with `requirePermission`
 * server-side. Hiding a nav item is never the access control.
 */
type NavItem = { href: string; label: string; permission?: Permission };

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/events", label: "Events", permission: "event.view" },
  { href: "/dashboard/team", label: "Team", permission: "tenant.manage_members" },
  { href: "/dashboard/settings", label: "Settings", permission: "settings.manage" },
  { href: "/dashboard/audit", label: "Audit log", permission: "audit.view" },
];

export function DashboardNav({ permissions }: { permissions: ReadonlySet<Permission> }) {
  const visible = ITEMS.filter((item) => !item.permission || permissions.has(item.permission));

  return (
    <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-0.5">
      {visible.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
