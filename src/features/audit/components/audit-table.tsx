import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLogRow } from "@/server/db/repositories/audit.repository";

/** Renders an audit trail (spec §23). Used by both the platform and tenant views. */
export function AuditTable({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No audit entries yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Resource</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {row.createdAt.toLocaleString()}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <code className="text-xs">{row.action}</code>
                {row.viaImpersonation ? (
                  <Badge variant="outline" className="text-[10px]">
                    impersonated
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-sm">{row.actorEmail ?? row.actorUserId ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {row.resourceType
                ? `${row.resourceType}${row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ""}`
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
