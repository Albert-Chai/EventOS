import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Track } from "@/features/analytics/components/track";
import { ClaimButton } from "@/features/vouchers/components/claim-button";
import { brandStyle } from "@/features/visitors/neon";
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

  const primary = branding?.primaryColor ?? "#ff2d78";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-8 sm:px-8" style={brandStyle(primary)}>
      <Track name="voucher_viewed" tenantSlug={event.tenantSlug} eventSlug={event.slug} />

      <div className="mb-5 grid gap-1">
        <Link href={baseHref} className="text-sm text-white/55 transition-colors hover:text-white">
          ← {event.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Vouchers</h1>
          <Link
            href={`${baseHref}/vouchers/mine`}
            className="text-sm font-semibold text-[var(--neon-lime)] underline-offset-4 hover:underline"
          >
            My vouchers →
          </Link>
        </div>
      </div>

      {vouchers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/20 p-8 text-center">
          <p className="text-sm font-semibold text-white">No vouchers right now</p>
          <p className="mt-1 text-sm text-white/55">Check back closer to the event.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {vouchers.map((voucher) => {
            const remaining = remainingQuantity(voucher);
            return (
              <li
                key={voucher.id}
                className="neon-surface relative overflow-hidden rounded-2xl p-4"
              >
                {/* gradient rail — the ticket edge */}
                <span
                  className="absolute inset-y-0 left-0 w-1.5 bg-linear-to-b from-[var(--brand)] to-[var(--neon-violet)]"
                  aria-hidden
                />
                <div className="flex flex-wrap items-start justify-between gap-2 pl-2">
                  <div className="min-w-0">
                    <h2 className="font-bold tracking-tight text-white">{voucher.title}</h2>
                    {voucher.merchantName ? (
                      <p className="mt-0.5 text-sm text-white/50">at {voucher.merchantName}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-linear-to-br from-[var(--brand)] to-[var(--neon-tangerine)] px-3 py-1 text-sm font-extrabold text-[#14061f]">
                    {describeDiscount(voucher)}
                  </span>
                </div>

                {voucher.description ? (
                  <p className="mt-2 pl-2 text-sm text-white/80">{voucher.description}</p>
                ) : null}
                {voucher.terms ? (
                  <p className="mt-2 pl-2 text-xs text-white/45">{voucher.terms}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-end justify-between gap-3 pl-2">
                  <ClaimButton
                    tenantSlug={event.tenantSlug}
                    eventSlug={event.slug}
                    voucherId={voucher.id}
                    claimable={voucher.claimable}
                    claimed={voucher.claimed}
                  />
                  {remaining !== null ? (
                    <span className="text-xs font-medium text-white/50">
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
