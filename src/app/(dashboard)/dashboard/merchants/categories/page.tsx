import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryForm } from "@/features/merchants/components/category-form";
import { listCategoriesForTenant } from "@/server/db/repositories/merchant-categories.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Merchant categories",
  robots: { index: false, follow: false },
};

export default async function MerchantCategoriesPage() {
  const ctx = await requirePermissionOrRedirect("merchant.view", "/dashboard/merchants/categories");
  const categories = await listCategoriesForTenant(ctx.tenant.id);
  const canManage = ctx.permissions.has("merchant.create");

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link href="/dashboard/merchants" className="text-muted-foreground text-sm hover:underline">
          ← Merchants
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-muted-foreground text-sm">
          Group merchants so visitors can filter the directory.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Existing categories
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-sm">No categories yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Add a category
            </CardTitle>
            <CardDescription>Case-insensitive; each name is unique per workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryForm />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
