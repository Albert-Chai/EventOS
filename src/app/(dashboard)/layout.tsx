import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { env } from "@/config/env";
import { signOutAction } from "@/features/auth/actions";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";
import { ImpersonationBanner } from "@/features/impersonation/components/impersonation-banner";
import { TenantSwitcher } from "@/features/workspace/components/tenant-switcher";
import { requireUserOrRedirect } from "@/server/policies/require-user";

/**
 * Authenticated organizer shell (spec §18): workspace switcher, permission-gated
 * navigation, impersonation banner, platform-admin shortcut.
 *
 * Uses `requireUserOrRedirect`, not `requireTenantOrRedirect`, so a user with no
 * membership can still reach `/dashboard` — which routes them to the
 * "no workspace" screen. The nav and switcher render only with an active tenant.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserOrRedirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col">
      {ctx.impersonation && ctx.tenant ? (
        <ImpersonationBanner impersonation={ctx.impersonation} tenantName={ctx.tenant.name} />
      ) : null}

      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            {env.NEXT_PUBLIC_APP_NAME}
          </Link>
          {ctx.tenant ? <TenantSwitcher active={ctx.tenant} memberships={ctx.memberships} /> : null}
        </div>

        <div className="flex items-center gap-3">
          {ctx.isPlatformAdmin ? (
            <Link href="/platform" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Platform
              <Badge variant="secondary" className="ml-1.5">
                admin
              </Badge>
            </Link>
          ) : null}
          <span className="text-muted-foreground hidden text-sm sm:inline">{ctx.user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {ctx.tenant ? (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:flex-row sm:px-6">
          <aside className="sm:w-48 sm:shrink-0">
            <DashboardNav permissions={ctx.permissions} />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : (
        <main className="flex-1 px-4 py-8 sm:px-6">{children}</main>
      )}
    </div>
  );
}
