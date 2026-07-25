import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import {
  MerchantForm,
  type MerchantFormValues,
} from "@/features/merchants/components/merchant-form";
import { listCategoriesForTenant } from "@/server/db/repositories/merchant-categories.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "New merchant",
  robots: { index: false, follow: false },
};

const BLANK: MerchantFormValues = {
  name: "",
  slug: "",
  categoryId: "",
  description: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
};

export default async function NewMerchantPage() {
  const ctx = await requirePermissionOrRedirect("merchant.create", "/dashboard/merchants/new");
  const categories = await listCategoriesForTenant(ctx.tenant.id);

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link href="/dashboard/merchants" className="text-muted-foreground text-sm hover:underline">
          ← Merchants
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New merchant</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <MerchantForm mode="create" defaults={BLANK} categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
