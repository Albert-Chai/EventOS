import { index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { tenants } from "./tenants";

/**
 * Uploaded media records (spec §12 `files`). One row per object in the
 * `eventos-public` Storage bucket — the durable, tenant-scoped record that the
 * reserved `*_file_id` columns across the app point at.
 *
 * The row is written only through the repository layer with a `tenant_id`
 * derived from context; the Storage object itself is written by the one
 * sanctioned service-role Storage path (`src/server/media/storage.ts`) to a
 * server-constructed, tenant-leading path. See docs/phase-4-plan.md §3.
 *
 * `bucket`+`path` is unique. `created_by → auth.users` is a hand-written FK.
 */
export const files = pgTable(
  "files",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bucket: text("bucket").notNull(),
    path: text("path").notNull(),
    /** What the file is for (`map_floor`, `merchant_logo`, …) — for cleanup + audit. */
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name"),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (table) => [
    unique("files_bucket_path_uq").on(table.bucket, table.path),
    index("files_tenant_idx").on(table.tenantId),
  ],
);

export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
