import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  addParticipationAction,
  featureMerchantAction,
  unfeatureMerchantAction,
} from "@/features/merchants/actions";
import { ParticipationStatusBadge } from "@/features/merchants/components/participation-status-badge";
import { ReviewControls } from "@/features/merchants/components/review-controls";
import { formatPrice } from "@/features/merchants/format";
import { planHasFeature } from "@/server/billing/plans";
import { listItemsForParticipation } from "@/server/db/repositories/listing-items.repository";
import { listMerchantsForTenant } from "@/server/db/repositories/merchants.repository";
import { listParticipationsForEvent } from "@/server/db/repositories/participations.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { listFeaturedParticipationIds } from "@/server/services/featured.service";
import { getTenantPlan } from "@/server/services/plan.service";
import type { ParticipationStatus } from "@/server/merchants/status";

export const metadata: Metadata = {
  title: "Event merchants",
  robots: { index: false, follow: false },
};

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export default async function EventMerchantsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "merchant.view",
    `/dashboard/events/${eventId}/merchants`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const [participations, allMerchants, featuredIds, { plan }] = await Promise.all([
    listParticipationsForEvent(ctx.tenant.id, eventId),
    listMerchantsForTenant(ctx.tenant.id),
    listFeaturedParticipationIds(eventId),
    getTenantPlan(ctx.tenant.id),
  ]);

  const itemsByParticipation = new Map(
    await Promise.all(
      participations.map(async (p) => [p.id, await listItemsForParticipation(p.id)] as const),
    ),
  );

  const participatingIds = new Set(participations.map((p) => p.merchantId));
  const addable = allMerchants.filter((m) => !participatingIds.has(m.id));

  const canAdd = ctx.permissions.has("merchant.create");
  const canReview =
    ctx.permissions.has("merchant.approve") || ctx.permissions.has("merchant.reject");
  const canFeature = ctx.permissions.has("merchant.feature");
  const planHasFeatured = planHasFeature(plan, "featured_listings");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Merchants</h1>
        <p className="text-muted-foreground text-sm">
          Add merchants to this event and review their listings.
        </p>
      </div>

      {canAdd ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Add a merchant
            </CardTitle>
            <CardDescription>
              Pick one from your directory. Create new merchants under Merchants.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {addable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every merchant in your directory is already in this event.{" "}
                <Link href="/dashboard/merchants/new" className="underline">
                  Create another
                </Link>
                .
              </p>
            ) : (
              <form action={addParticipationAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="eventId" value={eventId} />
                <select name="merchantId" required defaultValue="" className={SELECT_CLASS}>
                  <option value="" disabled>
                    Select a merchant…
                  </option>
                  {addable.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm">
                  Add to event
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {participations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No merchants yet
            </CardTitle>
            <CardDescription>Added merchants and their listings will appear here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {participations.map((p) => {
            const items = itemsByParticipation.get(p.id) ?? [];
            return (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle as="h2" className="text-base">
                      <Link
                        href={`/dashboard/merchants/${p.merchantId}`}
                        className="hover:underline"
                      >
                        {p.merchantName}
                      </Link>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {featuredIds.has(p.id) ? <Badge variant="secondary">★ Featured</Badge> : null}
                      <ParticipationStatusBadge status={p.approvalStatus as ParticipationStatus} />
                    </div>
                  </div>
                  {p.listingTitle ? (
                    <CardDescription>{p.listingTitle}</CardDescription>
                  ) : (
                    <CardDescription>No listing submitted yet.</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="grid gap-3">
                  {p.listingDescription ? <p className="text-sm">{p.listingDescription}</p> : null}

                  {items.length > 0 ? (
                    <ul className="grid gap-1 text-sm">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex justify-between border-b py-1 last:border-0"
                        >
                          <span>{item.name}</span>
                          <span className="text-muted-foreground">
                            {formatPrice(item.price, item.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No items.</p>
                  )}

                  {canReview ? (
                    <ReviewControls
                      participationId={p.id}
                      eventId={eventId}
                      status={p.approvalStatus as ParticipationStatus}
                    />
                  ) : null}

                  {canFeature && p.approvalStatus === "approved" ? (
                    featuredIds.has(p.id) ? (
                      <form action={unfeatureMerchantAction}>
                        <input type="hidden" name="participationId" value={p.id} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <SubmitButton size="sm" variant="outline" pendingText="Removing…">
                          Remove featured
                        </SubmitButton>
                      </form>
                    ) : planHasFeatured ? (
                      <form action={featureMerchantAction}>
                        <input type="hidden" name="participationId" value={p.id} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <SubmitButton size="sm" variant="secondary" pendingText="Featuring…">
                          ★ Feature this merchant
                        </SubmitButton>
                      </form>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Featured listings are a Growth plan feature.{" "}
                        <Link href="/dashboard/billing" className="underline">
                          Upgrade
                        </Link>
                        .
                      </p>
                    )
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
