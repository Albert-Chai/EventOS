import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrCreateProfile } from "@/server/services/profile.service";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/** Phase 1 replaces this with the organizer dashboard proper (spec §18). */
export default async function DashboardPage() {
  const ctx = await requireUserOrRedirect("/dashboard");
  const profile = await getOrCreateProfile(ctx);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.displayName ? `, ${profile.displayName}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {profile.email}
          {ctx.user.emailVerified ? "" : " — email not yet verified"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle as="h2">Foundation complete</CardTitle>
            <Badge variant="secondary">Phase 0</Badge>
          </div>
          <CardDescription>
            Authentication, database, migrations, logging, and the API contract are in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground grid gap-2 text-sm">
          <p>Next up — Phase 1, the multi-tenant platform:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Tenants and tenant membership</li>
            <li>Roles and permissions</li>
            <li>Platform admin console</li>
            <li>Organizer dashboard shell and tenant switcher</li>
            <li>Audit logs and tenant isolation tests</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
