import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventPhaseBadge } from "@/features/events/components/event-status-badge";
import { eventTypeLabel, formatEventDates } from "@/features/events/format";
import {
  findPublicTenant,
  listPublicEventsForTenant,
} from "@/server/db/repositories/events.repository";

type Params = { params: Promise<{ tenantSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await findPublicTenant(tenantSlug);
  if (!tenant) return { title: "Not found", robots: { index: false, follow: false } };
  return { title: `${tenant.name} — Events`, description: `Events by ${tenant.name}.` };
}

export default async function TenantPublicIndexPage({ params }: Params) {
  const { tenantSlug } = await params;

  const tenant = await findPublicTenant(tenantSlug);
  if (!tenant) notFound();

  const events = await listPublicEventsForTenant(tenantSlug);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
      <p className="text-muted-foreground mt-1 text-sm">Upcoming and recent events.</p>

      {events.length === 0 ? (
        <p className="text-muted-foreground mt-8 rounded-lg border border-dashed p-6 text-center text-sm">
          No public events yet — check back soon.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/${tenant.slug}/${event.slug}`}
                className="hover:bg-muted/50 flex flex-col gap-1 rounded-lg border p-4 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.name}</span>
                  <EventPhaseBadge phase={event.phase} />
                </div>
                <span className="text-muted-foreground text-sm">
                  {eventTypeLabel(event.eventType)} ·{" "}
                  {formatEventDates(event.startAt, event.endAt, event.timezone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
