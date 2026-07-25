import type { AuthenticatedContext } from "@/server/context";
import type { FileKind } from "./media.service";
import { removeFile, uploadImage } from "./media.service";

/**
 * Shared image-swap plumbing for the reserved `*_file_id` columns (merchant
 * logo/cover, listing-item image, event branding). Each entity service wraps
 * `swapImage` with an `apply` closure that writes its own column through the
 * repository layer, so tenant scoping stays where it belongs.
 *
 * The FILE_UPLOADED / FILE_REMOVED audit lines are written by `media.service`;
 * entity services add their own domain audit on top.
 */

export type ImageChange =
  { file: File; width: number | null; height: number | null } | { remove: true };

function numOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Reads an `<ImageUploadField name>` from a submitted form. Returns `null` when
 * nothing changed (no new file, no remove toggle), so the caller can skip work.
 */
export function parseImageChange(formData: FormData, name: string): ImageChange | null {
  const file = formData.get(name);
  const remove = formData.get(`${name}_remove`)?.toString() === "on";
  if (file instanceof File && file.size > 0) {
    return {
      file,
      width: numOrNull(formData.get(`${name}_width`)),
      height: numOrNull(formData.get(`${name}_height`)),
    };
  }
  if (remove) return { remove: true };
  return null;
}

/**
 * Applies an image change to one entity column. `apply` sets the column to the
 * new file id (or null); the previous object is removed afterwards. Returns the
 * new file id, or null when the image was cleared.
 */
export async function swapImage(
  ctx: AuthenticatedContext,
  params: {
    tenantId: string;
    scope: string;
    ownerId: string;
    kind: FileKind;
    currentFileId: string | null;
    change: ImageChange;
    apply: (fileId: string | null) => Promise<unknown>;
  },
): Promise<string | null> {
  if ("remove" in params.change) {
    await params.apply(null);
    if (params.currentFileId) await removeFile(ctx, params.tenantId, params.currentFileId);
    return null;
  }

  const record = await uploadImage(ctx, {
    tenantId: params.tenantId,
    scope: params.scope,
    ownerId: params.ownerId,
    kind: params.kind,
    file: params.change.file,
    width: params.change.width,
    height: params.change.height,
  });
  await params.apply(record.id);
  if (params.currentFileId) await removeFile(ctx, params.tenantId, params.currentFileId);
  return record.id;
}
