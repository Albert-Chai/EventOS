"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { claimVoucherAction } from "../actions";

/**
 * The public claim control. Optimistic-free on purpose: a claim can fail for
 * real reasons (sold out, already claimed), and showing the visitor a code that
 * doesn't exist would be worse than a half-second wait. On success it shows the
 * code inline and refreshes so the list reflects the new state.
 */
export function ClaimButton({
  tenantSlug,
  eventSlug,
  voucherId,
  claimable,
  claimed,
}: {
  tenantSlug: string;
  eventSlug: string;
  voucherId: string;
  claimable: boolean;
  claimed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ code?: string; error?: string } | null>(null);

  if (claimed && !result?.code) {
    return (
      <span className="text-sm font-semibold text-[var(--neon-mint)]">
        ✓ Claimed — see My vouchers
      </span>
    );
  }

  if (result?.code) {
    return (
      <div className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--neon-mint)]">✓ Claimed</span>
        <span className="font-mono text-lg font-bold tracking-widest text-white">
          {result.code}
        </span>
        <span className="text-xs text-white/50">Show this code at the stall.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={!claimable || pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const response = await claimVoucherAction({ tenantSlug, eventSlug, voucherId });
            if (response.ok) {
              setResult({ code: response.code });
              router.refresh();
            } else {
              setResult({ error: response.message });
            }
          });
        }}
        className={
          claimable
            ? "neon-cta w-fit px-5 py-2.5 text-sm disabled:opacity-50"
            : "w-fit rounded-full border border-white/16 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white/60"
        }
      >
        {pending ? "Claiming…" : claimable ? "Claim" : "Not available"}
      </button>
      {result?.error ? (
        <span className="text-xs text-[var(--destructive)]">{result.error}</span>
      ) : null}
    </div>
  );
}
