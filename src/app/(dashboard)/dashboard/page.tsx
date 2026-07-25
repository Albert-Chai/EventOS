import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLES } from "@/server/authz/roles";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const ctx = await requireUserOrRedirect("/dashboard");

  // No membership yet. A platform admin belongs in the console they run — not an
  // organizer empty state telling them to await an invitation. Everyone else
  // gets the dedicated "no workspace" screen.
  if (!ctx.tenant) redirect(ctx.isPlatformAdmin ? "/platform" : "/dashboard/no-workspace");

  const roleNames = ctx.tenant.roleKeys.map((key) => ROLES[key]?.name ?? key);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{ctx.tenant.name}</h1>
          {ctx.tenant.status === "suspended" ? (
            <Badge variant="destructive">Suspended</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          Signed in as {ctx.user.email}
          {roleNames.length > 0 ? ` · ${roleNames.join(", ")}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle as="h2">Event management ready</CardTitle>
            <Badge variant="secondary">Phase 2</Badge>
          </div>
          <CardDescription>
            Create events, configure and brand them, set operating hours, and publish to a public
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-3">
            {ctx.permissions.has("event.view") ? (
              <Link href="/dashboard/events" className={buttonVariants({ size: "sm" })}>
                Events
              </Link>
            ) : null}
            {ctx.permissions.has("tenant.manage_members") ? (
              <Link
                href="/dashboard/team"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Manage team
              </Link>
            ) : null}
            {ctx.permissions.has("settings.manage") ? (
              <Link
                href="/dashboard/settings"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Workspace settings
              </Link>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Next up — Phase 3: merchant onboarding, listings, and approvals.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
