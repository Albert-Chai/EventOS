import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { AssignmentStatus } from "../../booths/status";
import { booths } from "./booths";
import { primaryId, timestamps } from "./_shared";
import { events } from "./events";
import { merchants } from "./merchants";
import { merchantEventParticipations } from "./participations";
import { tenants } from "./tenants";

/**
 * Links a booth to a merchant's participation (spec §12 `booth_assignments`).
 * Its own lifecycle — `assigned → confirmed`, or → `cancelled` — with history:
 * reassigning cancels the old row and inserts a new one. One *active*
 * (non-cancelled) assignment per booth and per participation, enforced by
 * partial unique indexes in the hand-written migration. The booth's `status` is
 * kept in step by the service (see `src/server/booths/status.ts`).
 *
 * `assigned_by → auth.users` is a hand-written cross-schema FK.
 */
export const boothAssignments = pgTable(
  "booth_assignments",
  {
    id: primaryId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    boothId: uuid("booth_id")
      .notNull()
      .references(() => booths.id, { onDelete: "cascade" }),
    participationId: uuid("participation_id")
      .notNull()
      .references(() => merchantEventParticipations.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("assigned").$type<AssignmentStatus>(),
    // FK to auth.users is added in the hand-written migration (cross-schema).
    assignedBy: uuid("assigned_by"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    index("booth_assignments_tenant_idx").on(table.tenantId),
    index("booth_assignments_event_idx").on(table.eventId),
    index("booth_assignments_booth_idx").on(table.boothId),
    index("booth_assignments_participation_idx").on(table.participationId),
    index("booth_assignments_merchant_idx").on(table.merchantId),
  ],
);

export type BoothAssignment = typeof boothAssignments.$inferSelect;
export type NewBoothAssignment = typeof boothAssignments.$inferInsert;
