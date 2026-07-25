import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/config/env";
import { AppError } from "@/lib/api/errors";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { findPublicParticipationByMerchantSlug } from "@/server/db/repositories/participations.repository";
import {
  addFavourite,
  listFavouriteCards,
  listFavouriteParticipationIds,
  removeFavourite,
  type VisitorMerchantCard,
} from "@/server/db/repositories/visitor-favourites.repository";
import {
  listRecentViewCards,
  upsertRecentView,
} from "@/server/db/repositories/visitor-recent-views.repository";
import {
  findVisitorByAnonymousId,
  insertVisitor,
} from "@/server/db/repositories/visitors.repository";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import type { Visitor } from "@/server/db/schema";
import { publicFileUrl } from "./media.service";

/**
 * The visitor experience (spec §8.8). Anonymous, cookie-backed identity — a
 * `visitors` row is created lazily on the first favourite/view, so browsing writes
 * nothing. The tenant + event are always resolved from the public URL slugs
 * (`findPublicEvent`), never a client value: the §6 public-reads seam applied to
 * the visitor's own writes.
 */

const VISITOR_COOKIE = "eventos_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The card shape the UI renders, with the logo URL resolved. */
export type MerchantCardView = Omit<VisitorMerchantCard, "logoBucket" | "logoPath"> & {
  logoUrl: string | null;
};

export function toCardView(card: VisitorMerchantCard): MerchantCardView {
  const { logoBucket, logoPath, ...rest } = card;
  return {
    ...rest,
    logoUrl: logoBucket && logoPath ? publicFileUrl({ bucket: logoBucket, path: logoPath }) : null,
  };
}

/**
 * Resolves the visitor for a Server Action, minting + setting the cookie on first
 * use. MUST NOT be called from a Server Component (cookies can't be set there).
 */
async function resolveVisitorForAction(): Promise<Visitor> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) {
    const found = await findVisitorByAnonymousId(existing);
    if (found) return found;
    // Cookie present but row missing (e.g. reset db): re-create against the id.
    return insertVisitor({ anonymousId: existing });
  }

  const anonymousId = randomUUID();
  jar.set(VISITOR_COOKIE, anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return insertVisitor({ anonymousId });
}

/** Read-only visitor lookup for Server Components. Returns null if no cookie/row. */
export async function getVisitorForRead(): Promise<Visitor | null> {
  const jar = await cookies();
  const id = jar.get(VISITOR_COOKIE)?.value;
  if (!id) return null;
  return findVisitorByAnonymousId(id);
}

type MerchantRef = { tenantSlug: string; eventSlug: string; merchantSlug: string };

/** Resolves a public (event, participation) from URL slugs, or throws. */
async function resolvePublicTarget(ref: MerchantRef) {
  const event = await findPublicEvent(ref.tenantSlug, ref.eventSlug);
  if (!event) throw new AppError("EVENT_NOT_FOUND");
  const listing = await findPublicParticipationByMerchantSlug(event.id, ref.merchantSlug);
  if (!listing) throw new AppError("MERCHANT_NOT_FOUND");
  return { event, listing };
}

/** Adds or removes a favourite. Returns the resulting state. */
export async function setFavourite(
  ref: MerchantRef,
  favourite: boolean,
): Promise<{ favourited: boolean }> {
  const { event, listing } = await resolvePublicTarget(ref);

  const settings = await getEventSettings(event.tenantId, event.id);
  if (settings && !settings.enableFavourites) {
    throw new AppError("FORBIDDEN", { message: "Favourites are turned off for this event." });
  }

  const visitor = await resolveVisitorForAction();
  if (favourite) {
    await addFavourite({
      visitorId: visitor.id,
      tenantId: event.tenantId,
      eventId: event.id,
      participationId: listing.participationId,
      merchantId: listing.merchant.id,
    });
  } else {
    await removeFavourite(visitor.id, listing.participationId);
  }
  return { favourited: favourite };
}

/** Records a merchant view against the visitor (idempotent per participation). */
export async function recordView(ref: MerchantRef): Promise<void> {
  const { event, listing } = await resolvePublicTarget(ref);
  const visitor = await resolveVisitorForAction();
  await upsertRecentView({
    visitorId: visitor.id,
    tenantId: event.tenantId,
    eventId: event.id,
    participationId: listing.participationId,
    merchantId: listing.merchant.id,
  });
}

// --- Reads (Server Components) ---------------------------------------------

export async function listFavouriteParticipationIdsForRead(eventId: string): Promise<Set<string>> {
  const visitor = await getVisitorForRead();
  if (!visitor) return new Set();
  return new Set(await listFavouriteParticipationIds(visitor.id, eventId));
}

export async function listFavouritesForRead(eventId: string): Promise<MerchantCardView[]> {
  const visitor = await getVisitorForRead();
  if (!visitor) return [];
  return (await listFavouriteCards(visitor.id, eventId)).map(toCardView);
}

export async function listRecentViewsForRead(
  eventId: string,
  limit = 8,
): Promise<MerchantCardView[]> {
  const visitor = await getVisitorForRead();
  if (!visitor) return [];
  return (await listRecentViewCards(visitor.id, eventId, limit)).map(toCardView);
}
