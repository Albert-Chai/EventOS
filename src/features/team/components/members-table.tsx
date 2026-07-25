import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TenantMemberListItem } from "@/server/db/repositories/members.repository";

import { changeRolesAction, removeMemberAction } from "../actions";
import type { RoleOption } from "./role-options";

/**
 * Member list with inline role editing (a native <details> disclosure — no
 * client JS needed) and removal. Both post to permission-gated server actions.
 */
export function MembersTable({
  members,
  roles,
  currentUserId,
}: {
  members: TenantMemberListItem[];
  roles: RoleOption[];
  currentUserId: string;
}) {
  const active = members.filter((m) => m.status !== "removed");
  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key;

  if (active.length === 0) {
    return <p className="text-muted-foreground text-sm">No members yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead className="w-px text-right">Manage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {active.map((member) => (
          <TableRow key={member.memberId}>
            <TableCell>
              <div className="grid">
                <span className="font-medium">{member.displayName ?? member.email ?? "—"}</span>
                {member.displayName && member.email ? (
                  <span className="text-muted-foreground text-xs">{member.email}</span>
                ) : null}
                {member.status === "suspended" ? (
                  <Badge variant="outline" className="mt-1 w-fit">
                    Suspended
                  </Badge>
                ) : null}
              </div>
            </TableCell>

            <TableCell>
              <div className="flex flex-wrap gap-1">
                {member.roleKeys.length > 0 ? (
                  member.roleKeys.map((key) => (
                    <Badge key={key} variant="secondary">
                      {roleName(key)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs">No roles</span>
                )}
              </div>
            </TableCell>

            <TableCell className="text-right align-top">
              <details className="group">
                <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none text-sm underline underline-offset-4">
                  Edit
                </summary>
                <div className="mt-3 grid gap-3 text-left">
                  <form action={changeRolesAction} className="grid gap-2">
                    <input type="hidden" name="memberId" value={member.memberId} />
                    <div className="grid gap-1">
                      {roles.map((role) => (
                        <label key={role.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="roleKeys"
                            value={role.key}
                            defaultChecked={member.roleKeys.includes(role.key)}
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                    <Button type="submit" size="sm" className="justify-self-start">
                      Save roles
                    </Button>
                  </form>

                  {member.userId !== currentUserId ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={member.memberId} />
                      <Button type="submit" size="sm" variant="outline">
                        Remove from workspace
                      </Button>
                    </form>
                  ) : (
                    <p className="text-muted-foreground text-xs">You can&apos;t remove yourself.</p>
                  )}
                </div>
              </details>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
