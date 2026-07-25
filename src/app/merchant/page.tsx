import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMerchantsForUser } from "@/server/db/repositories/merchants.repository";
import { requireUserOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Merchant portal",
  robots: { index: false, follow: false },
};

export default async function MerchantIndexPage() {
  const ctx = await requireUserOrRedirect("/merchant");
  const merchants = await listMerchantsForUser(ctx.user.id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your merchants</h1>
        <p className="text-muted-foreground text-sm">
          Manage your listings for the events you&apos;ve been invited to.
        </p>
      </div>

      {merchants.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Nothing here yet
            </CardTitle>
            <CardDescription>
              You don&apos;t manage any merchants yet. If an organizer invited you, open the
              invitation link they shared to claim your merchant.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {merchants.map((m) => (
            <li key={m.id}>
              <Link
                href={`/merchant/${m.id}`}
                className="hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-muted-foreground text-sm">Manage →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
