import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { suspendTenantAction } from "@/features/platform/actions";
import { startImpersonationAction } from "@/features/impersonation/actions";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { listTenants } from "@/server/db/repositories/tenants.repository";

export const metadata: Metadata = {
  title: "Tenants",
  robots: { index: false, follow: false },
};

export default async function PlatformTenantsPage() {
  await requirePlatformAdminOrRedirect("/platform/tenants");
  const tenants = await listTenants();

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <Link href="/platform/tenants/new" className={buttonVariants({ size: "sm" })}>
          Create workspace
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          {tenants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No workspaces yet. Create the first one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Support</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                    <TableCell>
                      {tenant.status === "suspended" ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {/* Impersonation: a deliberate two-field form so a reason
                            can be recorded. Kept inline for Phase 1. */}
                        <form action={startImpersonationAction} className="flex items-center gap-1">
                          <input type="hidden" name="tenantId" value={tenant.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Reason (optional)"
                            className="border-input h-8 w-36 rounded-md border px-2 text-xs"
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Impersonate
                          </Button>
                        </form>
                        <form action={suspendTenantAction}>
                          <input type="hidden" name="tenantId" value={tenant.id} />
                          <input
                            type="hidden"
                            name="suspend"
                            value={tenant.status === "suspended" ? "false" : "true"}
                          />
                          <Button type="submit" size="sm" variant="ghost">
                            {tenant.status === "suspended" ? "Unsuspend" : "Suspend"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
