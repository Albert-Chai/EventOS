import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { countTenants } from "@/server/db/repositories/tenants.repository";
import { countPlatformAdmins } from "@/server/db/repositories/platform-admins.repository";

export const metadata: Metadata = {
  title: "Platform overview",
  robots: { index: false, follow: false },
};

export default async function PlatformOverviewPage() {
  await requirePlatformAdminOrRedirect("/platform");
  const [tenantCount, adminCount] = await Promise.all([countTenants(), countPlatformAdmins()]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-muted-foreground text-sm">
          Manage organizer workspaces, administrators, and the audit trail.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl">
              {tenantCount}
            </CardTitle>
            <CardDescription>
              {tenantCount === 1 ? "Organizer workspace" : "Organizer workspaces"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-3xl">
              {adminCount}
            </CardTitle>
            <CardDescription>
              {adminCount === 1 ? "Platform administrator" : "Platform administrators"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/platform/tenants/new" className={buttonVariants()}>
          Create a workspace
        </Link>
        <Link href="/platform/tenants" className={buttonVariants({ variant: "outline" })}>
          View all workspaces
        </Link>
      </div>
    </div>
  );
}
