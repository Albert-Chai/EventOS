import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { AuditTable } from "@/features/audit/components/audit-table";
import { requirePlatformAdminOrRedirect } from "@/server/policies/require-user";
import { listAuditLogs } from "@/server/db/repositories/audit.repository";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

export default async function PlatformAuditPage() {
  await requirePlatformAdminOrRedirect("/platform/audit");
  // No tenantId → the platform-wide trail. Gated by requirePlatformAdmin above.
  const rows = await listAuditLogs({ limit: 200 });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          Platform-wide record of sensitive actions (spec §23). The 200 most recent.
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
