import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { renderQrDataUrl } from "@/server/services/qr.service";
import { listMyVouchers } from "@/server/services/voucher.service";
import { describeDiscount } from "@/server/vouchers/status";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export const metadata: Metadata = {
  title: "My vouchers",
  // A visitor's own claimed codes must never be indexed.
  robots: { index: false, follow: false },
};

export default async function MyVouchersPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const [claims, branding] = await Promise.all([
    listMyVouchers({ tenantSlug, eventSlug }),
    getEventBranding(event.tenantId, event.id),
  ]);

  const primary = branding?.primaryColor ?? "#0f172a";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  // The QR encodes the code itself, so staff can scan or type it — the redeem
  // screen accepts the same string either way.
  const withQr = await Promise.all(
    claims.map(async (claim) => ({ ...claim, qr: await renderQrDataUrl(claim.code) })),
  );

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <div className="mb-4 grid gap-1">
        <Link href={`${baseHref}/vouchers`} className="text-muted-foreground text-sm hover:underline">
          ← Vouchers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">My vouchers</h1>
        <p className="text-muted-foreground text-sm">
          Show a code at the stall to redeem it. Codes are saved to this device.
        </p>
      </div>

      {withQr.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No vouchers claimed yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Claim one from the{" "}
            <Link href={`${baseHref}/vouchers`} className="underline underline-offset-4">
              vouchers page
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {withQr.map((claim) => {
            const used = Boolean(claim.redeemedAt) || claim.codeStatus === "redeemed";
            return (
              <li
                key={claim.claimId}
                className={`rounded-lg border p-4 ${used ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{claim.title}</h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: primary }}
                  >
                    {describeDiscount(claim)}
                  </span>
                </div>
                {claim.merchantName ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">at {claim.merchantName}</p>
                ) : null}

                <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Image
                    src={claim.qr}
                    alt={`QR code for voucher ${claim.code}`}
                    width={128}
                    height={128}
                    unoptimized
                    className="rounded-md border bg-white p-1"
                  />
                  <div className="grid gap-1">
                    <span className="font-mono text-xl font-semibold tracking-widest">
                      {claim.code}
                    </span>
                    {used ? (
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">
                        ✓ Redeemed
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {claim.expiresAt
                          ? `Valid until ${claim.expiresAt.toISOString().slice(0, 10)}`
                          : "No expiry"}
                      </span>
                    )}
                  </div>
                </div>

                {claim.terms ? (
                  <p className="text-muted-foreground mt-3 text-xs">{claim.terms}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
