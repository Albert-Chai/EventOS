import { AppError } from "@/lib/api/errors";
import type { FeaturedPlacementType } from "@/server/billing/plans";
import type { TenantScopedContext } from "@/server/context";
import {
  closeOpenPlacements,
  insertPlacement,
  listOpenParticipationIdsForEvent,
} from "@/server/db/repositories/featured-placements.repository";
import {
  findParticipationById,
  setParticipationFeaturedRank,
} from "@/server/db/repositories/participations.repository";
import type { FeaturedPlacement } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { requirePlanFeature } from "./usage.service";

/**
 * Featured listings (spec §8.7). Granting a placement is gated by the tenant's
 * plan (`featured_listings`), audited, and sets the participation's
 * `featured_rank` so the Phase 5 directory boosts it without any query change.
 * Unfeaturing closes the open placement (keeps history) and clears the rank.
 */

const DEFAULT_FEATURED_RANK = 100;

export async function featureMerchant(
  ctx: TenantScopedContext,
  input: {
    eventId: string;
    participationId: string;
    placementType?: FeaturedPlacementType;
    rankPriority?: number;
    notes?: string | null;
  },
): Promise<FeaturedPlacement> {
  await requirePlanFeature(ctx.tenant.id, "featured_listings");

  const participation = await findParticipationById(ctx.tenant.id, input.participationId);
  if (!participation || participation.eventId !== input.eventId) {
    throw new AppError("MERCHANT_NOT_FOUND");
  }

  const rank = input.rankPriority ?? DEFAULT_FEATURED_RANK;

  // Re-featuring is idempotent: close any open placement first (the partial
  // unique index allows only one open placement per participation).
  await closeOpenPlacements(ctx.tenant.id, input.participationId, new Date());

  const placement = await insertPlacement({
    tenantId: ctx.tenant.id,
    eventId: input.eventId,
    participationId: input.participationId,
    merchantId: participation.merchantId,
    placementType: input.placementType ?? "homepage_featured",
    rankPriority: rank,
    paymentStatus: "included",
    notes: input.notes ?? null,
    createdBy: ctx.user.id,
  });

  await setParticipationFeaturedRank(ctx.tenant.id, input.participationId, rank);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_FEATURED,
    resourceType: "participation",
    resourceId: input.participationId,
    after: { placementType: placement.placementType, rankPriority: rank },
  });

  ctx.log.info("merchant.featured", { participationId: input.participationId });
  return placement;
}

export async function unfeatureMerchant(
  ctx: TenantScopedContext,
  input: { participationId: string },
): Promise<boolean> {
  const closed = await closeOpenPlacements(ctx.tenant.id, input.participationId, new Date());
  await setParticipationFeaturedRank(ctx.tenant.id, input.participationId, null);

  if (closed) {
    await recordAudit(ctx, {
      action: AUDIT_ACTIONS.MERCHANT_UNFEATURED,
      resourceType: "participation",
      resourceId: input.participationId,
    });
    ctx.log.info("merchant.unfeatured", { participationId: input.participationId });
  }
  return closed;
}

/** The participation ids currently featured in an event — for badges/state. */
export async function listFeaturedParticipationIds(eventId: string): Promise<Set<string>> {
  return new Set(await listOpenParticipationIdsForEvent(eventId));
}
