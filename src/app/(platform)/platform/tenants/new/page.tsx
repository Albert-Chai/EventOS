import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTenantForm } from "@/features/platform/components/create-tenant-form";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Create workspace",
  robots: { index: false, follow: false },
};

export default async function NewTenantPage() {
  await requirePlatformAdminOrRedirect("/platform/tenants/new");

  return (
    <div className="mx-auto grid max-w-lg gap-4">
      <Link
        href="/platform/tenants"
        className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
      >
        ← Back to workspaces
      </Link>
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            Create a workspace
          </CardTitle>
          <CardDescription>Sets up an organizer tenant and links its owner.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTenantForm />
        </CardContent>
      </Card>
    </div>
  );
}
