import { randomUUID } from "node:crypto";

import { AppError } from "@/lib/api/errors";
import type { AuthenticatedContext } from "@/server/context";
import { deleteFileRow, insertFile } from "@/server/db/repositories/files.repository";
import type { FileRecord } from "@/server/db/schema";
import {
  ACCEPTED_IMAGE_TYPES,
  buildObjectPath,
  extensionForMime,
  getUploadBucket,
  MAX_IMAGE_BYTES,
  publicObjectUrl,
  UPLOAD_BUCKET,
} from "@/server/media/storage";
import { AUDIT_ACTIONS, recordAudit } from "./audit.service";
import { assertWithinLimit } from "./usage.service";

/**
 * The media seam (spec §12 `files`, docs/phase-4-plan.md §3). Uploads validate,
 * write the object to a server-constructed tenant-leading path, then record a
 * `files` row through the repository layer. Every `*_file_id` column in the app
 * is filled by `uploadImage` and cleared by `removeFile`.
 */

/** What a file is attached to — used for the `files.kind` column and audit. */
export type FileKind =
  "map_floor" | "merchant_logo" | "merchant_cover" | "listing_item" | "event_logo" | "event_cover";

type UploadInput = {
  tenantId: string;
  /** Path scope segment(s), e.g. `events/<id>/maps` — server-derived, never client. */
  scope: string;
  /** The owning entity id (floor, merchant, item…), for a stable path prefix. */
  ownerId: string;
  kind: FileKind;
  file: File;
  /** Optional natural pixel dimensions, captured client-side. */
  width?: number | null;
  height?: number | null;
};

function assertValidImage(file: File): asserts file is File {
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("VALIDATION_ERROR", { message: "No file was uploaded." });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError("FILE_TOO_LARGE", {
      message: `Images must be ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB or smaller.`,
    });
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", {
      message: "Upload a PNG, JPEG, WebP, or AVIF image.",
    });
  }
}

/** Uploads an image and records the `files` row. Returns the new record. */
export async function uploadImage(
  ctx: AuthenticatedContext,
  input: UploadInput,
): Promise<FileRecord> {
  assertValidImage(input.file);

  const extension = extensionForMime(input.file.type);
  if (!extension) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", { message: "Unsupported image type." });
  }

  // Plan limit: total storage bytes per tenant (§22).
  await assertWithinLimit(input.tenantId, "storage_bytes", { delta: input.file.size });

  const path = buildObjectPath({
    tenantId: input.tenantId,
    scope: input.scope,
    ownerId: input.ownerId,
    unique: randomUUID(),
    extension,
  });

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const { error } = await getUploadBucket().upload(path, bytes, {
    contentType: input.file.type,
    upsert: false,
  });
  if (error) {
    ctx.log.error("media.upload_failed", { kind: input.kind, reason: error.message });
    throw new AppError("SERVICE_UNAVAILABLE", { message: "The image could not be uploaded." });
  }

  const record = await insertFile({
    tenantId: input.tenantId,
    bucket: UPLOAD_BUCKET,
    path,
    kind: input.kind,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    width: input.width ?? null,
    height: input.height ?? null,
    originalName: input.file.name || null,
    createdBy: ctx.user.id,
  });

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.FILE_UPLOADED,
    resourceType: "file",
    resourceId: record.id,
    tenantId: input.tenantId,
    after: { kind: input.kind, sizeBytes: record.sizeBytes },
  });

  return record;
}

/**
 * Removes a file: deletes the `files` row (tenant-scoped) and best-effort removes
 * the object. Callers must first clear any `*_file_id` referencing it — the FKs
 * are `ON DELETE SET NULL`, so a stale reference would otherwise linger until the
 * next write. Returns true if a row was deleted.
 */
export async function removeFile(
  ctx: AuthenticatedContext,
  tenantId: string,
  fileId: string,
): Promise<boolean> {
  const removed = await deleteFileRow(tenantId, fileId);
  if (!removed) return false;

  const { error } = await getUploadBucket().remove([removed.path]);
  if (error) {
    // The row is gone; a leftover object is a storage-cleanup concern, not a
    // user-facing failure. Log so it can be swept later.
    ctx.log.warn("media.object_orphaned", { path: removed.path, reason: error.message });
  }

  await recordAudit(ctx, {
    action: AUDIT_ACTIONS.FILE_REMOVED,
    resourceType: "file",
    resourceId: fileId,
    tenantId,
    before: { kind: removed.kind },
  });
  return true;
}

/** Public read URL for a media record (the bucket is public — no signing). */
export function publicFileUrl(file: Pick<FileRecord, "bucket" | "path">): string {
  return publicObjectUrl(file.bucket, file.path);
}
