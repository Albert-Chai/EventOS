import { timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";
import { AppError } from "@/lib/api/errors";

/**
 * Guards a cron route with a constant-time `CRON_SECRET` bearer check, shared by
 * every `/api/cron/*` handler.
 *
 * A missing secret is `503 NOT_CONFIGURED` (the job isn't wired in this
 * environment — the endpoint exists but is inert until a secret is set), a wrong
 * one is `401`. Never returns whether the secret exists to an unauthenticated
 * caller beyond that distinction, and the comparison is length-safe + constant-time.
 */
export function requireCronAuth(request: Request): void {
  const secret = env.CRON_SECRET;
  if (!secret) {
    throw new AppError("NOT_CONFIGURED", {
      message: "CRON_SECRET is not set; this job is disabled.",
    });
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    throw new AppError("UNAUTHENTICATED", { message: "Invalid cron credentials." });
  }
}
