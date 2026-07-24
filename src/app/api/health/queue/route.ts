import { NextResponse } from "next/server";

import { env } from "@/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Readiness probe for the background job queue (spec §24, §30).
 *
 * Phase 0 has no queue. This reports `not_configured` with a 200 rather than
 * pretending to be healthy or failing the deploy: an honest "absent" is
 * actionable, a fake "ok" is worse than no probe at all.
 *
 * Phase 3 (CSV import) wires the real worker and turns this into a live check.
 */
export async function GET() {
  const configured = Boolean(env.REDIS_URL);

  return NextResponse.json({
    success: true,
    data: {
      status: configured ? "ok" : "not_configured",
      dependency: "queue",
      note: configured
        ? undefined
        : "No queue backend configured. Background jobs land in Phase 3.",
    },
    meta: {},
  });
}
