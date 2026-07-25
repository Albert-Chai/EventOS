import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceSettingsForm } from "@/features/workspace/components/settings-form";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { findTenantById } from "@/server/db/repositories/tenants.repository";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const ctx = await requirePermissionOrRedirect("settings.manage", "/dashboard/settings");
  const tenant = await findTenantById(ctx.tenant.id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>
        <p className="text-muted-foreground text-sm">Manage your organizer profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Profile
          </CardTitle>
          <CardDescription>Workspace slug: {ctx.tenant.slug}</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceSettingsForm
            defaults={{
              name: tenant?.name ?? ctx.tenant.name,
              contactEmail: tenant?.contactEmail ?? "",
              contactPhone: tenant?.contactPhone ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
