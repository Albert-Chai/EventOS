import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  eventBranding,
  eventOperatingHours,
  eventSettings,
  events,
  tenants,
  type Event,
  type NewEvent,
} from "@/server/db/schema";
import type { EventVisibility } from "@/server/events/event-types";
import { PUBLIC_STATUSES, type EventPhase, type EventStatus } from "@/server/events/status";

/**
 * Events.
 *
 * Every function here is tenant-scoped: it takes a `tenantId` the caller derived
 * from `ctx.tenant.id` via the policy layer, never from client input, and every
 * predicate leads with `tenant_id` (spec §5). The two `findPublic*` reads are the
 * exception by design — they serve anonymous visitors and so filter by *public
 * status + visibility* instead of membership, resolving the tenant from its slug.
 */

// --- Tenant-scoped (organizer) --------------------------------------------

export async function findEventById(tenantId: string, id: string): Promise<Event | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.tenantId, tenantId), isNull(events.deletedAt)))
    .limit(1);
  return event ?? null;
}

export async function findEventBySlug(tenantId: string, slug: string): Promise<Event | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(sql`lower(${events.slug})`, slug.toLowerCase()),
        isNull(events.deletedAt),
      ),
    )
    .limit(1);
  return event ?? null;
}

export async function slugExistsForTenant(
  tenantId: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const existing = await findEventBySlug(tenantId, slug);
  if (!existing) return false;
  return exceptId ? existing.id !== exceptId : true;
}

export async function listEventsForTenant(
  tenantId: string,
  options?: { search?: string; status?: EventStatus },
): Promise<Event[]> {
  const search = options?.search?.trim();
  return db
    .select()
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        isNull(events.deletedAt),
        options?.status ? eq(events.status, options.status) : undefined,
        search
          ? or(ilike(events.name, `%${search}%`), ilike(events.slug, `%${search}%`))
          : undefined,
      ),
    )
    .orderBy(desc(events.createdAt));
}

export async function countEventsForTenant(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), isNull(events.deletedAt)));
  return row?.value ?? 0;
}

/**
 * Creates an event and its 1:1 satellites (settings + branding) with default
 * values, in a single transaction, so a settings/branding read never misses.
 */
export async function createEventWithDefaults(input: NewEvent): Promise<Event> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({ ...input, slug: input.slug.toLowerCase() })
      .returning();

    await tx.insert(eventSettings).values({ tenantId: event.tenantId, eventId: event.id });
    await tx.insert(eventBranding).values({ tenantId: event.tenantId, eventId: event.id });

    return event;
  });
}

/** Patch mutable event columns. `tenant_id` in the predicate guards cross-tenant writes. */
export async function updateEvent(
  tenantId: string,
  id: string,
  patch: Partial<
    Pick<
      Event,
      | "name"
      | "slug"
      | "eventType"
      | "shortDescription"
      | "description"
      | "venueName"
      | "venueAddress"
      | "latitude"
      | "longitude"
      | "timezone"
      | "startAt"
      | "endAt"
      | "visibility"
      | "status"
      | "publishedAt"
      | "archivedAt"
    >
  >,
): Promise<Event | null> {
  const [event] = await db
    .update(events)
    .set({ ...patch, ...(patch.slug ? { slug: patch.slug.toLowerCase() } : {}) })
    .where(and(eq(events.id, id), eq(events.tenantId, tenantId), isNull(events.deletedAt)))
    .returning();
  return event ?? null;
}

export async function softDeleteEvent(tenantId: string, id: string): Promise<Event | null> {
  const [event] = await db
    .update(events)
    .set({ deletedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.tenantId, tenantId), isNull(events.deletedAt)))
    .returning();
  return event ?? null;
}

/**
 * Deep-copies an event within the same tenant: a fresh `draft` with its own slug,
 * cleared publish/archive timestamps, plus copies of settings, branding, and
 * operating hours. All in one transaction.
 */
export async function duplicateEventRecord(params: {
  tenantId: string;
  source: Event;
  name: string;
  slug: string;
  createdBy: string;
}): Promise<Event> {
  const { tenantId, source, name, slug, createdBy } = params;
  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(events)
      .values({
        tenantId,
        name,
        slug: slug.toLowerCase(),
        eventType: source.eventType,
        shortDescription: source.shortDescription,
        description: source.description,
        venueName: source.venueName,
        venueAddress: source.venueAddress,
        latitude: source.latitude,
        longitude: source.longitude,
        timezone: source.timezone,
        startAt: source.startAt,
        endAt: source.endAt,
        // A duplicate always starts fresh, never inheriting live state.
        status: "draft",
        visibility: source.visibility,
        publishedAt: null,
        archivedAt: null,
        createdBy,
      })
      .returning();

    const [srcSettings] = await tx
      .select()
      .from(eventSettings)
      .where(eq(eventSettings.eventId, source.id))
      .limit(1);
    const {
      id: _sid,
      eventId: _seid,
      createdAt: _sca,
      updatedAt: _sua,
      ...settingsCols
    } = srcSettings ?? {};
    await tx.insert(eventSettings).values({ ...settingsCols, tenantId, eventId: copy.id });

    const [srcBranding] = await tx
      .select()
      .from(eventBranding)
      .where(eq(eventBranding.eventId, source.id))
      .limit(1);
    const {
      id: _bid,
      eventId: _beid,
      createdAt: _bca,
      updatedAt: _bua,
      ...brandingCols
    } = srcBranding ?? {};
    await tx.insert(eventBranding).values({ ...brandingCols, tenantId, eventId: copy.id });

    const srcHours = await tx
      .select()
      .from(eventOperatingHours)
      .where(eq(eventOperatingHours.eventId, source.id));
    if (srcHours.length > 0) {
      await tx.insert(eventOperatingHours).values(
        srcHours.map((h) => ({
          tenantId,
          eventId: copy.id,
          date: h.date,
          opensAt: h.opensAt,
          closesAt: h.closesAt,
          isClosed: h.isClosed,
          note: h.note,
        })),
      );
    }

    return copy;
  });
}

// --- Public (anonymous visitor) -------------------------------------------

export type PublicEvent = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  eventType: string;
  shortDescription: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  startAt: Date | null;
  endAt: Date | null;
  status: EventStatus;
  visibility: EventVisibility;
  publishedAt: Date | null;
  tenantName: string;
  tenantSlug: string;
  phase: EventPhase;
};

const phaseExpr = sql<EventPhase>`CASE
    WHEN ${events.status} = 'ended' THEN 'ended'
    WHEN ${events.startAt} IS NULL OR now() < ${events.startAt} THEN 'upcoming'
    WHEN ${events.endAt} IS NOT NULL AND now() > ${events.endAt} THEN 'ended'
    ELSE 'live'
  END`;

function publicColumns() {
  return {
    id: events.id,
    tenantId: events.tenantId,
    name: events.name,
    slug: events.slug,
    eventType: events.eventType,
    shortDescription: events.shortDescription,
    description: events.description,
    venueName: events.venueName,
    venueAddress: events.venueAddress,
    latitude: events.latitude,
    longitude: events.longitude,
    timezone: events.timezone,
    startAt: events.startAt,
    endAt: events.endAt,
    status: events.status,
    visibility: events.visibility,
    publishedAt: events.publishedAt,
    tenantName: tenants.name,
    tenantSlug: tenants.slug,
    phase: phaseExpr.as("phase"),
  };
}

/**
 * One publicly-visible event, resolved by tenant slug + event slug. Returns null
 * unless the event is in a public status, not `private`, not soft-deleted, and
 * its tenant is active — so a draft (or any non-public state) is indistinguishable
 * from "not found". This is the guard that keeps drafts off the public web.
 */
export async function findPublicEvent(
  tenantSlug: string,
  eventSlug: string,
): Promise<PublicEvent | null> {
  const [row] = await db
    .select(publicColumns())
    .from(events)
    .innerJoin(tenants, eq(tenants.id, events.tenantId))
    .where(
      and(
        eq(sql`lower(${tenants.slug})`, tenantSlug.toLowerCase()),
        eq(sql`lower(${events.slug})`, eventSlug.toLowerCase()),
        eq(tenants.status, "active"),
        isNull(tenants.deletedAt),
        isNull(events.deletedAt),
        inArray(events.status, [...PUBLIC_STATUSES]),
        ne(events.visibility, "private"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Publicly-listable events for a tenant's index page (public visibility only). */
export async function listPublicEventsForTenant(tenantSlug: string): Promise<PublicEvent[]> {
  return db
    .select(publicColumns())
    .from(events)
    .innerJoin(tenants, eq(tenants.id, events.tenantId))
    .where(
      and(
        eq(sql`lower(${tenants.slug})`, tenantSlug.toLowerCase()),
        eq(tenants.status, "active"),
        isNull(tenants.deletedAt),
        isNull(events.deletedAt),
        inArray(events.status, [...PUBLIC_STATUSES]),
        eq(events.visibility, "public"),
      ),
    )
    .orderBy(asc(events.startAt));
}

/** Tenant name/slug for a public index header, only if the tenant is active. */
export async function findPublicTenant(
  tenantSlug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const [row] = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(
      and(
        eq(sql`lower(${tenants.slug})`, tenantSlug.toLowerCase()),
        eq(tenants.status, "active"),
        isNull(tenants.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
