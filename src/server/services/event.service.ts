import { AppError } from "@/lib/api/errors";
import { isValidSlug, slugify } from "@/lib/slug";
import type { TenantScopedContext } from "@/server/context";
import {
  createEventWithDefaults,
  duplicateEventRecord,
  findEventById,
  slugExistsForTenant,
  softDeleteEvent,
  updateEvent as updateEventRow,
} from "@/server/db/repositories/events.repository";
import {
  replaceEventOperatingHours,
  updateEventBranding,
  updateEventSettings,
  type OperatingHourInput,
} from "@/server/db/repositories/event-config.repository";
import type { Event, EventBranding, EventSettings } from "@/server/db/schema";
import type { EventType, EventVisibility } from "@/server/events/event-types";
import { canTransition, type EventStatus } from "@/server/events/status";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Event lifecycle (spec §8.3). Every function is tenant-scoped: the `tenantId`
 * always comes from `ctx.tenant.id`, and every event is fetched through
 * `findEventById(ctx.tenant.id, …)`, so a request for another tenant's event id
 * returns `EVENT_NOT_FOUND` — the row is invisible, never editable. Callers are
 * gated by the matching `event.*` permission in the action layer; the service
 * owns transition legality, the publish gate, and auditing.
 */

export type CreateEventInput = {
  name: string;
  slug?: string;
  eventType?: EventType;
  shortDescription?: string | null;
  description?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  timezone?: string;
  startAt?: Date | null;
  endAt?: Date | null;
  visibility?: EventVisibility;
};

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    throw new AppError("VALIDATION_ERROR", { message: "Event name is too short." });
  }
  return trimmed;
}

function resolveSlug(explicit: string | undefined, name: string): string {
  const slug = (explicit?.trim() || slugify(name)).toLowerCase();
  if (!isValidSlug(slug)) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Slug must be 3–48 chars, lowercase letters/numbers/hyphens, and not reserved.",
      details: { slug },
    });
  }
  return slug;
}

function assertDateOrder(startAt: Date | null | undefined, endAt: Date | null | undefined): void {
  if (startAt && endAt && endAt <= startAt) {
    throw new AppError("VALIDATION_ERROR", {
      message: "The end date must be after the start date.",
    });
  }
}

export async function createEvent(
  ctx: TenantScopedContext,
  input: CreateEventInput,
): Promise<Event> {
  const name = assertName(input.name);
  const slug = resolveSlug(input.slug, name);
  assertDateOrder(input.startAt, input.endAt);

  if (await slugExistsForTenant(ctx.tenant.id, slug)) {
    throw new AppError("SLUG_TAKEN", { details: { slug } });
  }

  const event = await createEventWithDefaults({
    tenantId: ctx.tenant.id,
    name,
    slug,
    eventType: input.eventType ?? "other",
    shortDescription: input.shortDescription ?? null,
    description: input.description ?? null,
    venueName: input.venueName ?? null,
    venueAddress: input.venueAddress ?? null,
    ...(input.timezone ? { timezone: input.timezone } : {}),
    startAt: input.startAt ?? null,
    endAt: input.endAt ?? null,
    ...(input.visibility ? { visibility: input.visibility } : {}),
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_CREATED,
    resourceType: "event",
    resourceId: event.id,
    after: { name: event.name, slug: event.slug, status: event.status },
  });

  ctx.log.info("event.created", { eventId: event.id, slug: event.slug });
  return event;
}

export type UpdateEventInput = Partial<
  Pick<
    CreateEventInput,
    | "name"
    | "slug"
    | "eventType"
    | "shortDescription"
    | "description"
    | "venueName"
    | "venueAddress"
    | "timezone"
    | "startAt"
    | "endAt"
    | "visibility"
  > & { latitude: number | null; longitude: number | null }
>;

async function requireEvent(ctx: TenantScopedContext, eventId: string): Promise<Event> {
  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) throw new AppError("EVENT_NOT_FOUND");
  return event;
}

export async function updateEvent(
  ctx: TenantScopedContext,
  eventId: string,
  input: UpdateEventInput,
): Promise<Event> {
  const event = await requireEvent(ctx, eventId);

  const patch: Parameters<typeof updateEventRow>[2] = {};

  if (input.name !== undefined) patch.name = assertName(input.name);
  if (input.slug !== undefined) {
    const slug = resolveSlug(input.slug, input.name ?? event.name);
    if (slug !== event.slug && (await slugExistsForTenant(ctx.tenant.id, slug, eventId))) {
      throw new AppError("SLUG_TAKEN", { details: { slug } });
    }
    patch.slug = slug;
  }
  if (input.eventType !== undefined) patch.eventType = input.eventType;
  if (input.shortDescription !== undefined) patch.shortDescription = input.shortDescription;
  if (input.description !== undefined) patch.description = input.description;
  if (input.venueName !== undefined) patch.venueName = input.venueName;
  if (input.venueAddress !== undefined) patch.venueAddress = input.venueAddress;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = input.endAt;
  if (input.visibility !== undefined) patch.visibility = input.visibility;

  assertDateOrder(
    patch.startAt !== undefined ? patch.startAt : event.startAt,
    patch.endAt !== undefined ? patch.endAt : event.endAt,
  );

  const updated = await updateEventRow(ctx.tenant.id, eventId, patch);
  if (!updated) throw new AppError("EVENT_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_UPDATED,
    resourceType: "event",
    resourceId: eventId,
    before: { name: event.name, slug: event.slug, visibility: event.visibility },
    after: { name: updated.name, slug: updated.slug, visibility: updated.visibility },
  });

  return updated;
}

/**
 * The publish gate (spec §19 minimum): an event cannot go public until it has a
 * name, a valid date range, and a venue. Returns the list of what is missing.
 */
function assertPublishable(event: Event): void {
  const missing: string[] = [];
  if (!event.name?.trim()) missing.push("name");
  if (!event.startAt || !event.endAt) missing.push("dates");
  else if (event.endAt <= event.startAt) missing.push("a valid date range");
  if (!event.venueName?.trim()) missing.push("venue");

  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", {
      message: `Cannot publish yet — add ${missing.join(", ")} first.`,
      details: { missing },
    });
  }
}

/**
 * Moves an event to a new status, enforcing the transition machine
 * (`src/server/events/status.ts`) and stamping `published_at` / `archived_at`.
 * The caller is gated by `permissionForTransition(to)` in the action layer.
 */
export async function transitionEventStatus(
  ctx: TenantScopedContext,
  eventId: string,
  to: EventStatus,
): Promise<Event> {
  const event = await requireEvent(ctx, eventId);
  const from = event.status;

  if (!canTransition(from, to)) {
    throw new AppError("INVALID_STATE_TRANSITION", {
      message: `An event cannot move from ${from} to ${to}.`,
      details: { from, to },
    });
  }

  if (to === "published") assertPublishable(event);

  const updated = await updateEventRow(ctx.tenant.id, eventId, {
    status: to,
    ...(to === "published" && !event.publishedAt ? { publishedAt: new Date() } : {}),
    ...(to === "archived" ? { archivedAt: new Date() } : {}),
  });
  if (!updated) throw new AppError("EVENT_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_STATUS_CHANGED,
    resourceType: "event",
    resourceId: eventId,
    before: { status: from },
    after: { status: to },
  });

  ctx.log.info("event.status_changed", { eventId, from, to });
  return updated;
}

export async function duplicateEvent(ctx: TenantScopedContext, eventId: string): Promise<Event> {
  const source = await requireEvent(ctx, eventId);

  const name = `Copy of ${source.name}`.slice(0, 120);
  // Find a free slug: base, then base-2, base-3, …
  const base = slugify(name) || `${source.slug}-copy`;
  let slug = base;
  for (let n = 2; await slugExistsForTenant(ctx.tenant.id, slug); n++) {
    slug = `${base}-${n}`.slice(0, 48);
  }

  const copy = await duplicateEventRecord({
    tenantId: ctx.tenant.id,
    source,
    name,
    slug,
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_DUPLICATED,
    resourceType: "event",
    resourceId: copy.id,
    after: { name: copy.name, slug: copy.slug, sourceId: source.id },
  });

  return copy;
}

export async function deleteEvent(ctx: TenantScopedContext, eventId: string): Promise<void> {
  const event = await requireEvent(ctx, eventId);
  await softDeleteEvent(ctx.tenant.id, eventId);
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_DELETED,
    resourceType: "event",
    resourceId: eventId,
    before: { name: event.name, slug: event.slug, status: event.status },
  });
}

// --- Config ---------------------------------------------------------------

export async function updateSettings(
  ctx: TenantScopedContext,
  eventId: string,
  patch: Partial<Omit<EventSettings, "id" | "tenantId" | "eventId" | "createdAt" | "updatedAt">>,
): Promise<EventSettings> {
  await requireEvent(ctx, eventId);
  const settings = await updateEventSettings(ctx.tenant.id, eventId, patch);
  if (!settings) throw new AppError("EVENT_NOT_FOUND");
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_SETTINGS_UPDATED,
    resourceType: "event",
    resourceId: eventId,
    after: patch,
  });
  return settings;
}

export async function updateBranding(
  ctx: TenantScopedContext,
  eventId: string,
  patch: Partial<Omit<EventBranding, "id" | "tenantId" | "eventId" | "createdAt" | "updatedAt">>,
): Promise<EventBranding> {
  await requireEvent(ctx, eventId);
  const branding = await updateEventBranding(ctx.tenant.id, eventId, patch);
  if (!branding) throw new AppError("EVENT_NOT_FOUND");
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_BRANDING_UPDATED,
    resourceType: "event",
    resourceId: eventId,
    after: patch,
  });
  return branding;
}

export async function setOperatingHours(
  ctx: TenantScopedContext,
  eventId: string,
  rows: OperatingHourInput[],
): Promise<void> {
  await requireEvent(ctx, eventId);
  await replaceEventOperatingHours(ctx.tenant.id, eventId, rows);
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.EVENT_HOURS_UPDATED,
    resourceType: "event",
    resourceId: eventId,
    after: { days: rows.length },
  });
}
