import { NextResponse } from "next/server";

import { env } from "@/config/env";
import { createServiceRoleClient } from "@/server/auth/supabase";
import { logger } from "@/server/telemetry/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Readiness probe for object storage: confirms the configured bucket exists. */
export async function GET() {
  const started = Date.now();
  const bucket = env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.storage.getBucket(bucket);
    const latencyMs = Date.now() - started;

    if (error) {
      logger.error("health.storage_bucket_missing", { bucket, latencyMs, reason: error.message });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Storage bucket is not reachable.",
            details: { bucket },
          },
          meta: {},
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { status: "ok", dependency: "storage", bucket, latencyMs },
      meta: {},
    });
  } catch (error) {
    logger.error("health.storage_unreachable", { bucket, error });
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "Storage is unreachable.", details: {} },
        meta: {},
      },
      { status: 503 },
    );
  }
}
