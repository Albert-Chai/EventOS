import { NextResponse } from "next/server";
import { sql as raw } from "drizzle-orm";

import { db } from "@/server/db";
import { logger } from "@/server/telemetry/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Readiness probe for Postgres: round-trips a trivial query and reports latency. */
export async function GET() {
  const started = Date.now();

  try {
    await db.execute(raw`select 1`);
    const latencyMs = Date.now() - started;

    return NextResponse.json({
      success: true,
      data: { status: "ok", dependency: "database", latencyMs },
      meta: {},
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    logger.error("health.database_unreachable", { latencyMs, error });

    return NextResponse.json(
      {
        success: false,
        // No driver message: a connection error can carry the host and user.
        error: { code: "SERVICE_UNAVAILABLE", message: "Database is unreachable.", details: {} },
        meta: {},
      },
      { status: 503 },
    );
  }
}
