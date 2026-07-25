import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/config/env";
import { signOutAction } from "@/features/auth/actions";
import { requireUserOrRedirect } from "@/server/policies/require-user";

/**
 * The merchant portal shell (spec §17, §18: simple, mobile-first). Authenticated
 * but not tenant-scoped — a merchant member need not be an organizer. Each page
 * enforces merchant membership with `requireMerchantMember`.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUserOrRedirect("/merchant");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/merchant" className="font-semibold tracking-tight">
            {env.NEXT_PUBLIC_APP_NAME}
          </Link>
          <Badge variant="secondary">Merchant</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">{ctx.user.email}</span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
