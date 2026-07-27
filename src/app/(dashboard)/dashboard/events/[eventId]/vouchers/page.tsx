import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changeVoucherStatusAction } from "@/features/vouchers/actions";
import { ClaimStat } from "@/features/vouchers/components/claim-stat";
import { VoucherForm } from "@/features/vouchers/components/voucher-form";
import { VoucherStatusBadge } from "@/features/vouchers/components/voucher-status-badge";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listParticipationsForEvent } from "@/server/db/repositories/participations.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { getVoucherPerformance } from "@/server/services/voucher.service";
import { allowedVoucherTransitions, describeDiscount, VOUCHER_STATUS_LABELS } from "@/server/vouchers/status";

export const metadata: Metadata = {
  title: "Vouchers",
  robots: { index: false, follow: false },
};

export default async function EventVouchersPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const base = `/dashboard/events/${eventId}/vouchers`;
  const ctx = await requirePermissionOrRedirect("voucher.manage", base);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const [{ vouchers, recent }, participations] = await Promise.all([
    getVoucherPerformance(ctx, eventId),
    listParticipationsForEvent(ctx.tenant.id, eventId),
  ]);

  const merchants = participations
    .filter((p) => p.approvalStatus === "approved")
    .map((p) => ({ id: p.merchantId, name: p.merchantName }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Vouchers</h1>
        <p className="text-muted-foreground text-sm">
          Promotions visitors claim on the public site and merchants redeem at the stall.
        </p>
      </div>

      {vouchers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No vouchers yet
            </CardTitle>
            <CardDescription>
              Create one below. It stays a draft until you activate it, and only active vouchers
              appear on the public site.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {vouchers.map((voucher) => (
            <li key={voucher.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{voucher.title}</h2>
                    <VoucherStatusBadge status={voucher.status} />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {describeDiscount(voucher)}
                    {voucher.merchantName ? ` · ${voucher.merchantName}` : " · Event-wide"}
                  </p>
                  {voucher.description ? (
                    <p className="text-muted-foreground mt-1 text-sm">{voucher.description}</p>
                  ) : null}
                </div>

                <ClaimStat
                  claims={voucher.claims}
                  redemptions={voucher.redemptions}
                  totalQuantity={voucher.totalQuantity}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {allowedVoucherTransitions(voucher.status).map((next) => (
                  <form key={next} action={changeVoucherStatusAction}>
                    <input type="hidden" name="voucherId" value={voucher.id} />
                    <input type="hidden" name="status" value={next} />
                    <Button type="submit" variant="outline" size="sm">
                      {VOUCHER_STATUS_LABELS[next]}
                    </Button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Create a voucher
          </CardTitle>
          <CardDescription>
            Vouchers are part of your plan&apos;s entitlements. Activate one to publish it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoucherForm eventId={eventId} merchants={merchants} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Recent redemptions
          </CardTitle>
          <CardDescription>The latest codes redeemed at the event.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing redeemed yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
                  <span>
                    <span className="font-mono tracking-widest">{r.code}</span> · {r.title}
                  </span>
                  <span className="text-muted-foreground">
                    {r.merchantName ?? "Event-wide"} · {r.redeemedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
