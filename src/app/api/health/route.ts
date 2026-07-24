import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness probe (spec §30).
 *
 * Answers only "is this process serving requests" — it deliberately checks no
 * dependency. A liveness probe that fails when the database is briefly
 * unreachable causes the orchestrator to kill healthy instances and turn a
 * blip into an outage. Dependency readiness lives in the sub-routes.
 *
 * Not wrapped in `withApi`: probes must not depend on the auth service, which
 * building a request context requires.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      status: "ok",
      service: "eventos",
      environment: process.env.NODE_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    },
    meta: {},
  });
}
