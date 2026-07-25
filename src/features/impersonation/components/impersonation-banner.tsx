import { Button } from "@/components/ui/button";
import type { ImpersonationContext } from "@/server/context";

import { stopImpersonationAction } from "../actions";

/**
 * Persistent, impossible-to-miss banner shown whenever a request is running
 * inside an impersonation session (spec §20). Support staff must always know
 * they are acting as someone else — an invisible impersonation is how mistakes
 * and abuse happen.
 */
export function ImpersonationBanner({
  impersonation,
  tenantName,
}: {
  impersonation: ImpersonationContext;
  tenantName: string;
}) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 dark:bg-amber-600 dark:text-amber-50">
      <span>
        Impersonating <strong>{tenantName}</strong> — support session ends{" "}
        <time dateTime={impersonation.expiresAt.toISOString()}>
          {impersonation.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
        . All actions are logged.
      </span>
      <form action={stopImpersonationAction}>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="border-amber-950/30 bg-amber-100 text-amber-950 hover:bg-amber-50"
        >
          Stop impersonating
        </Button>
      </form>
    </div>
  );
}
