import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

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
import {
  deleteMerchantAction,
  revokeMerchantInvitationAction,
  suspendMerchantAction,
} from "@/features/merchants/actions";
import { InviteMerchantForm } from "@/features/merchants/components/invite-merchant-form";
import {
  MerchantForm,
  type MerchantFormValues,
} from "@/features/merchants/components/merchant-form";
import { listCategoriesForTenant } from "@/server/db/repositories/merchant-categories.repository";
import {
  listMembersOfMerchant,
  listMerchantInvitations,
} from "@/server/db/repositories/merchant-members.repository";
import { findMerchantById } from "@/server/db/repositories/merchants.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Merchant",
  robots: { index: false, follow: false },
};

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "merchant.view",
    `/dashboard/merchants/${merchantId}`,
  );

  const merchant = await findMerchantById(ctx.tenant.id, merchantId);
  if (!merchant) notFound();

  const [categories, members, invitations] = await Promise.all([
    listCategoriesForTenant(ctx.tenant.id),
    listMembersOfMerchant(ctx.tenant.id, merchantId),
    listMerchantInvitations(ctx.tenant.id, merchantId),
  ]);
  const pending = invitations.filter((i) => i.status === "pending");

  const canManage = ctx.permissions.has("merchant.update");
  const canDelete = ctx.permissions.has("merchant.delete");

  const defaults: MerchantFormValues = {
    name: merchant.name,
    slug: merchant.slug,
    categoryId: merchant.categoryId ?? "",
    description: merchant.description ?? "",
    contactName: merchant.contactName ?? "",
    contactEmail: merchant.contactEmail ?? "",
    contactPhone: merchant.contactPhone ?? "",
    website: merchant.website ?? "",
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/dashboard/merchants" className="text-muted-foreground text-sm hover:underline">
          ← Merchants
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{merchant.name}</h1>
          <Badge variant={merchant.status === "suspended" ? "destructive" : "secondary"}>
            {merchant.status}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <MerchantForm
              mode="edit"
              merchantId={merchant.id}
              defaults={defaults}
              categories={categories}
            />
          ) : (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{merchant.contactEmail ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd>{merchant.description ?? "—"}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Members
          </CardTitle>
          <CardDescription>People who can manage this merchant in the portal.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one has claimed this merchant yet — send a claim invite below.
            </p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {members.map((m) => (
                <li key={m.memberId} className="flex justify-between">
                  <span>{m.email ?? m.userId}</span>
                  <span className="text-muted-foreground">{m.displayName ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Invite the merchant
            </CardTitle>
            <CardDescription>
              They&apos;ll get a link to claim this merchant and manage its listings.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <InviteMerchantForm merchantId={merchant.id} />
            {pending.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {inv.expiresAt.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={revokeMerchantInvitationAction}>
                          <input type="hidden" name="merchantId" value={merchant.id} />
                          <input type="hidden" name="invitationId" value={inv.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            Revoke
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Manage
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={suspendMerchantAction}>
              <input type="hidden" name="merchantId" value={merchant.id} />
              <input
                type="hidden"
                name="suspend"
                value={merchant.status === "suspended" ? "false" : "true"}
              />
              <Button type="submit" size="sm" variant="outline">
                {merchant.status === "suspended" ? "Unsuspend" : "Suspend"}
              </Button>
            </form>
            {canDelete ? (
              <form action={deleteMerchantAction}>
                <input type="hidden" name="merchantId" value={merchant.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Delete
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
