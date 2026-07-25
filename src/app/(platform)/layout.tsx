import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { env } from "@/config/env";
import { signOutAction } from "@/features/auth/actions";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";

/**
 * Platform admin console shell (spec §4.1). Guarded by
 * `requirePlatformAdminOrRedirect` — a non-admin is bounced to the dashboard and
 * never learns this section exists. Every page and action below re-checks.
 */
const NAV = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/tenants", label: "Tenants" },
  { href: "/platform/plans", label: "Plans" },
  { href: "/platform/admins", label: "Admins" },
  { href: "/platform/audit", label: "Audit log" },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformAdminOrRedirect("/platform");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href="/platform" className="font-semibold tracking-tight">
            {env.NEXT_PUBLIC_APP_NAME}
          </Link>
          <Badge variant="secondary">Platform</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            My workspace
          </Link>
          <span className="text-muted-foreground hidden text-sm sm:inline">{ctx.user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:flex-row sm:px-6">
        <aside className="sm:w-44 sm:shrink-0">
          <nav className="flex gap-1 overflow-x-auto sm:flex-col sm:gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2 text-sm whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
