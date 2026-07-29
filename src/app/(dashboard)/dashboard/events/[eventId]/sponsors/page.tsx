import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setBookingStatusAction } from "@/features/ads/dashboard-actions";
import { BookingForm, SponsorForm } from "@/features/ads/components/sponsor-forms";
import { adPerformanceForEvent } from "@/server/db/repositories/analytics-events.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import {
  isBookingLive,
  listBookingsForEventScoped,
  listSponsorsForTenant,
} from "@/server/services/ads.service";
import { AD_BOOKING_STATUS_LABELS, AD_SLOT_LABELS } from "@/server/ads/slots";

export const metadata: Metadata = {
  title: "Sponsors",
  robots: { index: false, follow: false },
};

/**
 * Sponsor ad space for one event (docs/phase-9-sponsor-ads-plan.md).
 *
 * Gated on `sponsor.manage`; the service additionally requires the
 * `sponsor_module` plan entitlement, so a workspace without it sees a clear
 * error on submit rather than a hidden page.
 *
 * The report reads live from the raw analytics log — the numbers match it by
 * construction rather than drifting from a stored counter.
 */
export default async function EventSponsorsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const base = `/dashboard/events/${eventId}/sponsors`;
  const ctx = await requirePermissionOrRedirect("sponsor.manage", base);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  // Sequential: the dev/test pooler caps at one connection, and concurrent
  // queries stall there.
  const sponsors = await listSponsorsForTenant(ctx);
  const bookings = await listBookingsForEventScoped(ctx, eventId);
  const performance = await adPerformanceForEvent(eventId);

  const statsByBooking = new Map(performance.map((p) => [p.bookingId, p]));
  const now = new Date();
  const activeSponsors = sponsors.filter((s) => s.status === "active");

  const totals = performance.reduce(
    (acc, p) => ({ impressions: acc.impressions + p.impressions, clicks: acc.clicks + p.clicks }),
    { impressions: 0, clicks: 0 },
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Sponsors &amp; ad space</h1>
        <p className="text-muted-foreground text-sm">
          Sell banner space on the visitor app. A booking runs in one slot for a date range; when
          several share a slot they rotate by weight.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>
            {totals.impressions.toLocaleString()} impressions ·{" "}
            {totals.clicks.toLocaleString()} clicks across every booking on this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No bookings yet. Add a sponsor, then book them into a slot below.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-3 font-medium">Sponsor</th>
                    <th className="py-2 pr-3 font-medium">Slot</th>
                    <th className="py-2 pr-3 font-medium">Runs</th>
                    <th className="py-2 pr-3 text-right font-medium">Impr.</th>
                    <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                    <th className="py-2 pr-3 text-right font-medium">CTR</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const stats = statsByBooking.get(b.id);
                    const impressions = stats?.impressions ?? 0;
                    const clicks = stats?.clicks ?? 0;
                    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                    const live = isBookingLive(b, now);
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{b.sponsorName}</td>
                        <td className="py-2 pr-3">{AD_SLOT_LABELS[b.slot]}</td>
                        <td className="text-muted-foreground py-2 pr-3 text-xs">
                          {b.startsAt ? b.startsAt.toLocaleDateString() : "open"} →{" "}
                          {b.endsAt ? b.endsAt.toLocaleDateString() : "open"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {impressions.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {clicks.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{ctr.toFixed(1)}%</td>
                        <td className="py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                live
                                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                                  : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold"
                              }
                            >
                              {live ? "Serving" : AD_BOOKING_STATUS_LABELS[b.status]}
                            </span>
                            {b.status !== "archived" ? (
                              <form action={setBookingStatusAction}>
                                <input type="hidden" name="eventId" value={eventId} />
                                <input type="hidden" name="bookingId" value={b.id} />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={b.status === "active" ? "paused" : "active"}
                                />
                                <Button type="submit" variant="outline" size="sm">
                                  {b.status === "active" ? "Pause" : "Activate"}
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New booking</CardTitle>
          <CardDescription>
            Bookings start as a draft — upload a creative, then activate to start serving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm eventId={eventId} sponsors={activeSponsors} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sponsors</CardTitle>
          <CardDescription>
            {activeSponsors.length === 0
              ? "No sponsors yet."
              : `${activeSponsors.length} sponsor${activeSponsors.length === 1 ? "" : "s"} in this workspace.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {activeSponsors.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {activeSponsors.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-2 border-b py-1.5 last:border-0">
                  <span className="font-medium">{s.name}</span>
                  {s.websiteUrl ? (
                    <span className="text-muted-foreground text-xs">{s.websiteUrl}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <SponsorForm />
        </CardContent>
      </Card>
    </div>
  );
}
