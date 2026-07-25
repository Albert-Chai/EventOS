import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteEventAction, duplicateEventAction } from "@/features/events/actions";
import { EventChecklist, type ChecklistItem } from "@/features/events/components/event-checklist";
import { EventStatusBadge } from "@/features/events/components/event-status-badge";
import { StatusControls } from "@/features/events/components/status-controls";
import { eventTypeLabel, formatEventDates } from "@/features/events/format";
import {
  getEventBranding,
  listEventOperatingHours,
} from "@/server/db/repositories/event-config.repository";
import { countBoothsForEvent } from "@/server/db/repositories/booths.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listMapFloorsForEvent } from "@/server/db/repositories/maps.repository";
import { listZonesForEvent } from "@/server/db/repositories/zones.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { isPublicStatus } from "@/server/events/status";
import { isPubliclyReachable, type EventVisibility } from "@/server/events/event-types";

export const metadata: Metadata = {
  title: "Event",
  robots: { index: false, follow: false },
};

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect("event.view", `/dashboard/events/${eventId}`);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  const [branding, hours, zones, boothCount, floors] = await Promise.all([
    getEventBranding(ctx.tenant.id, eventId),
    listEventOperatingHours(ctx.tenant.id, eventId),
    listZonesForEvent(ctx.tenant.id, eventId),
    countBoothsForEvent(ctx.tenant.id, eventId),
    listMapFloorsForEvent(ctx.tenant.id, eventId),
  ]);

  const canEdit = ctx.permissions.has("event.update");
  const canCreate = ctx.permissions.has("event.create");
  const canDelete = ctx.permissions.has("event.delete");
  const canViewMerchants = ctx.permissions.has("merchant.view");
  const canManageBooths = ctx.permissions.has("booth.manage");
  const canManageMap = ctx.permissions.has("map.manage");
  const mapUploaded = floors.some((f) => f.imageFileId);

  const publicUrl =
    isPublicStatus(event.status) && isPubliclyReachable(event.visibility as EventVisibility)
      ? `/${ctx.tenant.slug}/${event.slug}`
      : null;

  const brandingCustomised = Boolean(
    branding &&
    (branding.theme !== "classic" ||
      branding.secondaryColor ||
      branding.accentColor ||
      branding.logoFileId),
  );

  const checklist: ChecklistItem[] = [
    {
      label: "Event details completed",
      done: Boolean(event.name && (event.shortDescription || event.description)),
    },
    { label: "Event dates configured", done: Boolean(event.startAt && event.endAt) },
    { label: "Venue configured", done: Boolean(event.venueName) },
    { label: "Operating hours set", done: hours.length > 0 },
    { label: "Branding customised", done: brandingCustomised },
    { label: "Zones created", done: zones.length > 0 },
    { label: "Map uploaded", done: mapUploaded },
    { label: "Booths added", done: boothCount > 0 },
    { label: "Event published", done: isPublicStatus(event.status) },
    { label: "Merchants invited and approved", done: false, upcoming: true },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/dashboard/events" className="text-muted-foreground text-sm hover:underline">
          ← Events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="text-muted-foreground text-sm">
          {eventTypeLabel(event.eventType)} ·{" "}
          {formatEventDates(event.startAt, event.endAt, event.timezone)}
        </p>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "justify-self-start",
            })}
          >
            View public page ↗
          </a>
        ) : null}
        {canViewMerchants ? (
          <Link
            href={`/dashboard/events/${event.id}/merchants`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "justify-self-start",
            })}
          >
            Manage merchants
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-base">
                Lifecycle
              </CardTitle>
              <CardDescription>
                {canEdit
                  ? "Move the event through its stages. Publishing needs a name, dates, and a venue."
                  : "You have read-only access to this event."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canEdit ? (
                <StatusControls eventId={event.id} status={event.status} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Current status: <EventStatusBadge status={event.status} />
                </p>
              )}
            </CardContent>
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Configure
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Link
                  href={`/dashboard/events/${event.id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Edit details
                </Link>
                <Link
                  href={`/dashboard/events/${event.id}/settings`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Settings
                </Link>
                <Link
                  href={`/dashboard/events/${event.id}/branding`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Branding
                </Link>
                <Link
                  href={`/dashboard/events/${event.id}/hours`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Operating hours
                </Link>
                {canManageBooths ? (
                  <Link
                    href={`/dashboard/events/${event.id}/booths`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Booths
                  </Link>
                ) : null}
                {canManageMap ? (
                  <Link
                    href={`/dashboard/events/${event.id}/map`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Floor plans
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {canCreate || canDelete ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  Manage
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {canCreate ? (
                  <form action={duplicateEventAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Duplicate
                    </Button>
                  </form>
                ) : null}
                {canDelete ? (
                  <form action={deleteEventAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              Setup checklist
            </CardTitle>
            <CardDescription>Everything to do before and after going live.</CardDescription>
          </CardHeader>
          <CardContent>
            <EventChecklist items={checklist} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
