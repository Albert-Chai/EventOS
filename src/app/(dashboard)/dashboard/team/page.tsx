import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
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
import { revokeInvitationAction } from "@/features/team/actions";
import { InviteForm } from "@/features/team/components/invite-form";
import { MembersTable } from "@/features/team/components/members-table";
import { ROLE_OPTIONS } from "@/features/team/components/role-options";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { listInvitationsForTenant } from "@/server/db/repositories/invitations.repository";
import { listMembersOfTenant } from "@/server/db/repositories/members.repository";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const ctx = await requirePermissionOrRedirect("tenant.manage_members", "/dashboard/team");

  const [members, invitations] = await Promise.all([
    listMembersOfTenant(ctx.tenant.id),
    listInvitationsForTenant(ctx.tenant.id),
  ]);
  const pending = invitations.filter((i) => i.status === "pending");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground text-sm">
          Invite people to {ctx.tenant.name} and manage their roles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable members={members} roles={ROLE_OPTIONS} currentUserId={ctx.user.id} />
        </CardContent>
      </Card>

      {pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Pending invitations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {invitation.roleKeys.map((key) => (
                          <Badge key={key} variant="secondary">
                            {ROLE_OPTIONS.find((r) => r.key === key)?.name ?? key}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {invitation.expiresAt.toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Revoke
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Invite a teammate
          </CardTitle>
          <CardDescription>
            They&apos;ll get a link to join. Invitations expire after 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm roles={ROLE_OPTIONS} />
        </CardContent>
      </Card>
    </div>
  );
}
