import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { revokeAdminAction } from "@/features/platform/actions";
import { GrantAdminForm } from "@/features/platform/components/grant-admin-form";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { listPlatformAdmins } from "@/server/db/repositories/platform-admins.repository";

export const metadata: Metadata = {
  title: "Platform admins",
  robots: { index: false, follow: false },
};

export default async function PlatformAdminsPage() {
  const ctx = await requirePlatformAdminOrRedirect("/platform/admins");
  const admins = await listPlatformAdmins();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform administrators</h1>
        <p className="text-muted-foreground text-sm">
          Full access to every workspace and to platform settings. Grant sparingly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Administrators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Granted</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((admin) => (
                <TableRow key={admin.userId}>
                  <TableCell className="font-medium">
                    {admin.email ?? admin.userId}
                    {admin.userId === ctx.user.id ? (
                      <span className="text-muted-foreground ml-2 text-xs">(you)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {admin.grantedAt.toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {admins.length > 1 ? (
                      <form action={revokeAdminAction}>
                        <input type="hidden" name="userId" value={admin.userId} />
                        <Button type="submit" size="sm" variant="ghost">
                          Revoke
                        </Button>
                      </form>
                    ) : (
                      <span className="text-muted-foreground text-xs">last admin</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Grant access
          </CardTitle>
          <CardDescription>Make an existing account a platform administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <GrantAdminForm />
        </CardContent>
      </Card>
    </div>
  );
}
