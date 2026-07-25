import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { AuditTable } from "@/features/audit/components/audit-table";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { listAuditLogs } from "@/server/db/repositories/audit.repository";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

export default async function TenantAuditPage() {
  const ctx = await requirePermissionOrRedirect("audit.view", "/dashboard/audit");
  // Scoped to this tenant — the audit view an organizer sees is their own only.
  const rows = await listAuditLogs({ tenantId: ctx.tenant.id, limit: 200 });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          Sensitive actions in {ctx.tenant.name}. The 200 most recent.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <AuditTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
