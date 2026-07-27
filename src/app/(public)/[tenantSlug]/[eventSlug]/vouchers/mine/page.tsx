import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { brandStyle } from "@/features/visitors/neon";
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

  const primary = branding?.primaryColor ?? "#ff2d78";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  // The QR encodes the code itself, so staff can scan or type it — the redeem
  // screen accepts the same string either way.
  const withQr = await Promise.all(
    claims.map(async (claim) => ({ ...claim, qr: await renderQrDataUrl(claim.code) })),
  );

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8" style={brandStyle(primary)}>
      <div className="mb-5 grid gap-1">
        <Link
          href={`${baseHref}/vouchers`}
          className="text-sm text-white/55 transition-colors hover:text-white"
        >
          ← Vouchers
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">My vouchers</h1>
        <p className="text-sm text-white/55">
          Show a code at the stall to redeem it. Codes are saved to this device.
        </p>
      </div>

      {withQr.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 p-8 text-center">
          <p className="text-sm font-semibold text-white">No vouchers claimed yet</p>
          <p className="mt-1 text-sm text-white/55">
            Claim one from the{" "}
            <Link
              href={`${baseHref}/vouchers`}
              className="font-semibold text-[var(--neon-lime)] underline-offset-4 hover:underline"
            >
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
                className={`neon-surface rounded-2xl p-4 ${used ? "opacity-55" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-bold tracking-tight text-white">{claim.title}</h2>
                  <span className="shrink-0 rounded-full bg-linear-to-br from-[var(--brand)] to-[var(--neon-tangerine)] px-3 py-1 text-xs font-extrabold text-[#14061f]">
                    {describeDiscount(claim)}
                  </span>
                </div>
                {claim.merchantName ? (
                  <p className="mt-0.5 text-sm text-white/50">at {claim.merchantName}</p>
                ) : null}

                <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Image
                    src={claim.qr}
                    alt={`QR code for voucher ${claim.code}`}
                    width={128}
                    height={128}
                    unoptimized
                    className="rounded-xl bg-white p-2"
                  />
                  <div className="grid gap-1">
                    <span className="font-mono text-xl font-bold tracking-widest text-white">
                      {claim.code}
                    </span>
                    {used ? (
                      <span className="text-sm font-semibold text-[var(--neon-mint)]">
                        ✓ Redeemed
                      </span>
                    ) : (
                      <span className="text-xs text-white/50">
                        {claim.expiresAt
                          ? `Valid until ${claim.expiresAt.toISOString().slice(0, 10)}`
                          : "No expiry"}
                      </span>
                    )}
                  </div>
                </div>

                {claim.terms ? <p className="mt-3 text-xs text-white/45">{claim.terms}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
