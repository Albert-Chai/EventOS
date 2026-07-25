import "server-only";

import { env } from "@/config/env";
import { createServiceRoleClient } from "@/server/auth/supabase";

/**
 * The single sanctioned service-role Storage path (CLAUDE §6).
 *
 * Writing an object to the `eventos-public` bucket needs the service-role
 * Storage API — the anon key can't write without Storage RLS policies, which
 * would reintroduce the row-security model we deliberately don't run. This is
 * NOT a violation of rule 5 (service role never in request paths): Storage is
 * Supabase-owned, not our `public.*` schema, and the object path is
 * **server-constructed** from `ctx.tenant.id` + entity ids, so there is no
 * client-controlled scoping. This module never touches a `public.*` table — the
 * `files` row is always written through the repository layer with a scoped
 * `tenant_id`.
 *
 * Keep every service-role Storage use behind this helper so the exception stays
 * auditable in one place.
 */

export const UPLOAD_BUCKET = env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

/** Accepted image types for every upload surface. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
] as const;

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB — under the 8 MB action limit.

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function extensionForMime(mime: string): string | null {
  return EXTENSION_BY_MIME[mime] ?? null;
}

/** The Storage bucket handle. Service-role — Storage only, never `public.*`. */
export function getUploadBucket() {
  return createServiceRoleClient().storage.from(UPLOAD_BUCKET);
}

/**
 * A tenant-leading object path: `{tenantId}/{scope}/{ownerId}/{uuid}.{ext}`.
 * Tenant-first so a path can never address another tenant's object. All parts
 * are server-derived; `unique` is the caller's random id.
 */
export function buildObjectPath(input: {
  tenantId: string;
  scope: string;
  ownerId: string;
  unique: string;
  extension: string;
}): string {
  return `${input.tenantId}/${input.scope}/${input.ownerId}/${input.unique}.${input.extension}`;
}

/** Public read URL for an object in the public bucket (no signing needed). */
export function publicObjectUrl(bucket: string, path: string): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
