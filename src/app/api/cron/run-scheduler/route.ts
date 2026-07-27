import { requireCronAuth } from "@/lib/api/cron-auth";
import { withApi } from "@/lib/api/handler";
import { runStatusScheduler } from "@/server/services/scheduler.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The status scheduler job (spec §34 job runner; see `docs/background-jobs.md`).
 * Advances date-driven event and voucher statuses across all tenants. Guarded by
 * `CRON_SECRET` (`requireCronAuth`) and idempotent, so a retry is safe. Scheduled
 * via `vercel.json`; equally callable by any external scheduler holding the token.
 */
export const GET = withApi(async ({ request }) => {
  requireCronAuth(request);
  return runStatusScheduler();
});
