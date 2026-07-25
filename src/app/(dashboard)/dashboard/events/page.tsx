import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventStatusBadge } from "@/features/events/components/event-status-badge";
import { eventTypeLabel, formatEventDates } from "@/features/events/format";
import { listEventsForTenant } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

export default async function EventsPage() {
  const ctx = await requirePermissionOrRedirect("event.view", "/dashboard/events");
  const events = await listEventsForTenant(ctx.tenant.id);
  const canCreate = ctx.permissions.has("event.create");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-muted-foreground text-sm">
            Create, configure, and publish events for {ctx.tenant.name}.
          </p>
        </div>
        {canCreate ? (
          <Link href="/dashboard/events/new" className={buttonVariants({ size: "sm" })}>
            New event
          </Link>
        ) : null}
      </div>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">
              No events yet
            </CardTitle>
            <CardDescription>
              {canCreate
                ? "Create your first event — you can save a draft and publish it when it's ready."
                : "Once an event manager creates an event, it will appear here."}
            </CardDescription>
          </CardHeader>
          {canCreate ? (
            <CardContent>
              <Link href="/dashboard/events/new" className={buttonVariants({ size: "sm" })}>
                New event
              </Link>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="hidden sm:table-cell">Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/events/${event.id}`}
                        className="font-medium hover:underline"
                      >
                        {event.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">/{event.slug}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {eventTypeLabel(event.eventType)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                      {formatEventDates(event.startAt, event.endAt, event.timezone)}
                    </TableCell>
                    <TableCell>
                      <EventStatusBadge status={event.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
