import Link from "next/link";

import { Button } from "@/components/ui/button";
import { env } from "@/config/env";
import { signOutAction } from "@/features/auth/actions";
import { requireUserOrRedirect } from "@/server/policies/require-user";

/**
 * Authenticated shell. Phase 1 replaces this with the real dashboard chrome:
 * sidebar navigation, tenant switcher, event switcher, setup checklist (§18).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserOrRedirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          {env.NEXT_PUBLIC_APP_NAME}
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">{ctx.user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
