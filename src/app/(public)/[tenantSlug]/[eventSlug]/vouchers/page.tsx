import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Track } from "@/features/analytics/components/track";
import { ClaimButton } from "@/features/vouchers/components/claim-button";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicVouchersForRead } from "@/server/services/voucher.service";
import { describeDiscount, remainingQuantity } from "@/server/vouchers/status";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `Vouchers · ${event.name}`,
    description: `Claim vouchers for ${event.name}.`,
    robots: { index: event.visibility === "public", follow: true },
  };
}

export default async function PublicVouchersPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const [{ vouchers, enabled }, branding] = await Promise.all([
    listPublicVouchersForRead({ tenantSlug, eventSlug }),
    getEventBranding(event.tenantId, event.id),
  ]);

  // Vouchers off for this event is indistinguishable from "no such page".
  if (!enabled) notFound();

  const primary = branding?.primaryColor ?? "#0f172a";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <Track name="voucher_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      <div className="mb-4 grid gap-1">
        <Link href={baseHref} className="text-muted-foreground text-sm hover:underline">
          ← {event.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Vouchers</h1>
          <Link
            href={`${baseHref}/vouchers/mine`}
            className="text-sm underline underline-offset-4"
            style={{ color: primary }}
          >
            My vouchers →
          </Link>
        </div>
      </div>

      {vouchers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No vouchers right now</p>
          <p className="text-muted-foreground mt-1 text-sm">Check back closer to the event.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {vouchers.map((voucher) => {
            const remaining = remainingQuantity(voucher);
            return (
              <li key={voucher.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{voucher.title}</h2>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: primary }}
                  >
                    {describeDiscount(voucher)}
                  </span>
                </div>

                {voucher.merchantName ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">at {voucher.merchantName}</p>
                ) : null}
                {voucher.description ? (
                  <p className="mt-2 text-sm">{voucher.description}</p>
                ) : null}
                {voucher.terms ? (
                  <p className="text-muted-foreground mt-2 text-xs">{voucher.terms}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  <ClaimButton
                    tenantSlug={event.tenantSlug}
                    eventSlug={event.slug}
                    voucherId={voucher.id}
                    claimable={voucher.claimable}
                    claimed={voucher.claimed}
                    primaryColor={primary}
                  />
                  {remaining !== null ? (
                    <span className="text-muted-foreground text-xs">
                      {remaining > 0 ? `${remaining} left` : "All claimed"}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
