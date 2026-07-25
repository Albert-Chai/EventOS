import { AppError } from "@/lib/api/errors";
import { isValidSlug, slugify } from "@/lib/slug";
import type { AuthenticatedContext } from "@/server/context";
import { findAuthUserByEmail } from "@/server/auth/admin";
import { createMemberWithRoles } from "@/server/db/repositories/members.repository";
import {
  findTenantById,
  insertTenant,
  slugExists,
  updateTenant,
} from "@/server/db/repositories/tenants.repository";
import type { Tenant } from "@/server/db/schema";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";

/**
 * Tenant lifecycle. Creation and suspension are platform-admin operations
 * (callers gated by `requirePlatformAdmin`); tenant self-service update is
 * gated by `tenant.update` within the tenant.
 */

export type CreateTenantInput = {
  name: string;
  slug?: string;
  ownerEmail: string;
  contactEmail?: string;
};

export type CreateTenantResult = { tenant: Tenant; ownerLinked: boolean };

/**
 * Creates a tenant and links its owner.
 *
 * The owner is identified by email. If that email already has an account, they
 * become an active Owner immediately; if not, no member is created here — the
 * platform admin should send an invitation instead (surfaced to the UI via
 * `ownerLinked: false`). Provisioning a brand-new account silently would create
 * a passwordless user with no way in.
 */
export async function createTenant(
  ctx: AuthenticatedContext,
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const name = input.name.trim();
  if (name.length < 2) throw new AppError("VALIDATION_ERROR", { message: "Name is too short." });

  const slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  if (!isValidSlug(slug)) {
    throw new AppError("VALIDATION_ERROR", {
      message: "Slug must be 3–48 chars, lowercase letters/numbers/hyphens, and not reserved.",
      details: { slug },
    });
  }
  if (await slugExists(slug)) {
    throw new AppError("SLUG_TAKEN", { details: { slug } });
  }

  const tenant = await insertTenant({
    name,
    slug,
    contactEmail: input.contactEmail?.toLowerCase() ?? input.ownerEmail.toLowerCase(),
    createdBy: ctx.user.id,
  });

  // Link the owner if the account already exists.
  const owner = await findAuthUserByEmail(input.ownerEmail);
  let ownerLinked = false;
  if (owner) {
    await createMemberWithRoles({
      tenantId: tenant.id,
      userId: owner.id,
      roleKeys: ["owner"],
      invitedBy: ctx.user.id,
      status: "active",
    });
    ownerLinked = true;
  }

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.TENANT_CREATED,
    resourceType: "tenant",
    resourceId: tenant.id,
    after: { name: tenant.name, slug: tenant.slug, ownerEmail: input.ownerEmail, ownerLinked },
    tenantId: tenant.id,
  });

  ctx.log.info("tenant.created", { tenantId: tenant.id, slug: tenant.slug, ownerLinked });
  return { tenant, ownerLinked };
}

export async function suspendTenant(
  ctx: AuthenticatedContext,
  tenantId: string,
  suspend: boolean,
): Promise<Tenant> {
  const before = await findTenantById(tenantId);
  if (!before) throw new AppError("NOT_FOUND", { message: "Tenant not found." });

  const tenant = await updateTenant(tenantId, { status: suspend ? "suspended" : "active" });
  if (!tenant) throw new AppError("NOT_FOUND", { message: "Tenant not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.TENANT_SUSPENDED,
    resourceType: "tenant",
    resourceId: tenantId,
    before: { status: before.status },
    after: { status: tenant.status },
    tenantId,
  });

  return tenant;
}

/** Tenant self-service update. Caller gated by `tenant.update`. */
export async function updateOwnTenant(
  ctx: AuthenticatedContext & { tenant: { id: string } },
  patch: { name?: string; contactEmail?: string; contactPhone?: string },
): Promise<Tenant> {
  const before = await findTenantById(ctx.tenant.id);
  if (!before) throw new AppError("NOT_FOUND", { message: "Tenant not found." });

  const tenant = await updateTenant(ctx.tenant.id, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.contactEmail !== undefined ? { contactEmail: patch.contactEmail.toLowerCase() } : {}),
    ...(patch.contactPhone !== undefined ? { contactPhone: patch.contactPhone } : {}),
  });
  if (!tenant) throw new AppError("NOT_FOUND", { message: "Tenant not found." });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.TENANT_UPDATED,
    resourceType: "tenant",
    resourceId: tenant.id,
    before: { name: before.name, contactEmail: before.contactEmail },
    after: { name: tenant.name, contactEmail: tenant.contactEmail },
  });

  return tenant;
}
