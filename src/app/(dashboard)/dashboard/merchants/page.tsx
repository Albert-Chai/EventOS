import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listMerchantsForTenant } from "@/server/db/repositories/merchants.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Merchants",
  robots: { index: false, follow: false },
};

export default async function MerchantsPage() {
  const ctx = await requirePermissionOrRedirect("merchant.view", "/dashboard/merchants");
  const merchants = await listMerchantsForTenant(ctx.tenant.id);
  const canCreate = ctx.permissions.has("merchant.create");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-muted-foreground text-sm">
            Your directory of merchants. Add them to events from an event&apos;s Merchants tab.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/merchants/categories"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Categories
          </Link>
          {canCreate ? (
            <Link href="/dashboard/merchants/new" className={buttonVariants({ size: "sm" })}>
              New merchant
            </Link>
          ) : null}
        </div>
      </div>

      {merchants.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No merchants yet
            </CardTitle>
            <CardDescription>
              {canCreate
                ? "Create a merchant, then invite its owner and add it to an event."
                : "Merchants added by your team will appear here."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="hidden sm:table-cell">Contact</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merchants.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/merchants/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">/{m.slug}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                      {m.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                      {m.contactEmail ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.status === "suspended" ? "destructive" : "secondary"}>
                        {m.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
