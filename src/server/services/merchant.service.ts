import { AppError } from "@/lib/api/errors";
import { isValidSlug, slugify } from "@/lib/slug";
import { generateToken, hashToken } from "@/server/authz/tokens";
import type { AuthenticatedContext, TenantScopedContext } from "@/server/context";
import {
  categorySlugExists,
  insertCategory,
} from "@/server/db/repositories/merchant-categories.repository";
import {
  createMerchantMember,
  findMerchantInvitationByTokenHash,
  insertMerchantInvitation,
  markMerchantInvitationAccepted,
} from "@/server/db/repositories/merchant-members.repository";
import {
  findMerchantById,
  insertMerchant,
  merchantSlugExists,
  softDeleteMerchant,
  updateMerchant as updateMerchantRow,
} from "@/server/db/repositories/merchants.repository";
import type { Merchant, MerchantCategory } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Merchant lifecycle (spec §8.4). Organizer operations are tenant-scoped (gated
 * by `merchant.*` in the action layer); invitation acceptance is the one flow a
 * not-yet-member user runs, guarded by an email match. Every mutation audits.
 */

const INVITATION_TTL_DAYS = 14;

export type CreateMerchantInput = {
  name: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
};

function assertName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new AppError("VALIDATION_ERROR", { message: "Name is too short." });
  return trimmed;
}

function resolveSlug(explicit: string | undefined | null, name: string): string {
  const slug = (explicit?.trim() || slugify(name)).toLowerCase();
  if (!isValidSlug(slug)) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Slug must be 3–48 chars, lowercase letters/numbers/hyphens, and not reserved.",
      details: { slug },
    });
  }
  return slug;
}

export async function createMerchant(
  ctx: TenantScopedContext,
  input: CreateMerchantInput,
): Promise<Merchant> {
  const name = assertName(input.name);
  const slug = resolveSlug(input.slug, name);
  if (await merchantSlugExists(ctx.tenant.id, slug)) {
    throw new AppError("SLUG_TAKEN", { details: { slug } });
  }

  const merchant = await insertMerchant({
    tenantId: ctx.tenant.id,
    name,
    slug,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail?.toLowerCase() ?? null,
    contactPhone: input.contactPhone ?? null,
    website: input.website ?? null,
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_CREATED,
    resourceType: "merchant",
    resourceId: merchant.id,
    after: { name: merchant.name, slug: merchant.slug },
  });
  return merchant;
}

export type UpdateMerchantInput = Partial<CreateMerchantInput>;

async function requireMerchant(ctx: TenantScopedContext, merchantId: string): Promise<Merchant> {
  const merchant = await findMerchantById(ctx.tenant.id, merchantId);
  if (!merchant) throw new AppError("MERCHANT_NOT_FOUND");
  return merchant;
}

export async function updateMerchant(
  ctx: TenantScopedContext,
  merchantId: string,
  input: UpdateMerchantInput,
): Promise<Merchant> {
  const merchant = await requireMerchant(ctx, merchantId);

  const patch: Parameters<typeof updateMerchantRow>[2] = {};
  if (input.name !== undefined) patch.name = assertName(input.name);
  if (input.slug !== undefined) {
    const slug = resolveSlug(input.slug, input.name ?? merchant.name);
    if (slug !== merchant.slug && (await merchantSlugExists(ctx.tenant.id, slug, merchantId))) {
      throw new AppError("SLUG_TAKEN", { details: { slug } });
    }
    patch.slug = slug;
  }
  if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
  if (input.description !== undefined) patch.description = input.description;
  if (input.contactName !== undefined) patch.contactName = input.contactName;
  if (input.contactEmail !== undefined)
    patch.contactEmail = input.contactEmail?.toLowerCase() ?? null;
  if (input.contactPhone !== undefined) patch.contactPhone = input.contactPhone;
  if (input.website !== undefined) patch.website = input.website;

  const updated = await updateMerchantRow(ctx.tenant.id, merchantId, patch);
  if (!updated) throw new AppError("MERCHANT_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_UPDATED,
    resourceType: "merchant",
    resourceId: merchantId,
    before: { name: merchant.name, slug: merchant.slug },
    after: { name: updated.name, slug: updated.slug },
  });
  return updated;
}

export async function setMerchantStatus(
  ctx: TenantScopedContext,
  merchantId: string,
  suspend: boolean,
): Promise<Merchant> {
  const merchant = await requireMerchant(ctx, merchantId);
  const updated = await updateMerchantRow(ctx.tenant.id, merchantId, {
    status: suspend ? "suspended" : "active",
  });
  if (!updated) throw new AppError("MERCHANT_NOT_FOUND");

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_SUSPENDED,
    resourceType: "merchant",
    resourceId: merchantId,
    before: { status: merchant.status },
    after: { status: updated.status },
  });
  return updated;
}

export async function deleteMerchant(ctx: TenantScopedContext, merchantId: string): Promise<void> {
  const merchant = await requireMerchant(ctx, merchantId);
  await softDeleteMerchant(ctx.tenant.id, merchantId);
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_UPDATED,
    resourceType: "merchant",
    resourceId: merchantId,
    before: { name: merchant.name, status: merchant.status },
    after: { deleted: true },
  });
}

/** Creates a claim-by-email invitation. Returns the raw token to build the link. */
export async function inviteMerchantContact(
  ctx: TenantScopedContext,
  merchantId: string,
  email: string,
): Promise<{ token: string; email: string }> {
  const merchant = await requireMerchant(ctx, merchantId);
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new AppError("VALIDATION_ERROR", { message: "Enter a valid email address." });
  }

  const { token, tokenHash } = generateToken();
  await insertMerchantInvitation({
    tenantId: ctx.tenant.id,
    merchantId: merchant.id,
    email: normalized,
    tokenHash,
    invitedBy: ctx.user.id,
    expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_INVITED,
    resourceType: "merchant",
    resourceId: merchant.id,
    after: { email: normalized },
  });
  return { token, email: normalized };
}

/**
 * Accepts a merchant claim invitation: verifies it, checks the signed-in user's
 * email matches, and links them as a merchant member. Auth failures are generic.
 */
export async function acceptMerchantInvitation(
  ctx: AuthenticatedContext,
  token: string,
): Promise<{ merchantId: string; merchantSlug: string }> {
  const found = await findMerchantInvitationByTokenHash(hashToken(token));
  if (!found || found.invitation.status !== "pending" || found.expired) {
    throw new AppError("VALIDATION_ERROR", { message: "This invitation is invalid or expired." });
  }
  if (ctx.user.email.toLowerCase() !== found.invitation.email.toLowerCase()) {
    throw new AppError("FORBIDDEN", {
      message: "This invitation was sent to a different email address.",
    });
  }

  await createMerchantMember({
    merchantId: found.merchant.id,
    tenantId: found.merchant.tenantId,
    userId: ctx.user.id,
    invitedBy: found.invitation.invitedBy,
    status: "active",
  });
  await markMerchantInvitationAccepted(found.invitation.id, ctx.user.id);

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_MEMBER_JOINED,
    resourceType: "merchant",
    resourceId: found.merchant.id,
    tenantId: found.merchant.tenantId,
    after: { userId: ctx.user.id },
  });

  return { merchantId: found.merchant.id, merchantSlug: found.merchant.slug };
}

export async function createCategory(
  ctx: TenantScopedContext,
  name: string,
): Promise<MerchantCategory> {
  const trimmed = assertName(name);
  const slug = slugify(trimmed);
  if (!slug) throw new AppError("VALIDATION_ERROR", { message: "Enter a category name." });
  if (await categorySlugExists(ctx.tenant.id, slug)) {
    throw new AppError("CONFLICT", { message: "That category already exists." });
  }

  const category = await insertCategory({ tenantId: ctx.tenant.id, name: trimmed, slug });
  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.MERCHANT_CATEGORY_CREATED,
    resourceType: "merchant_category",
    resourceId: category.id,
    after: { name: category.name },
  });
  return category;
}
