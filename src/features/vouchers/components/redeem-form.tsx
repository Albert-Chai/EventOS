"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { redeemAsMerchantAction, redeemAsOrganizerAction } from "../actions";
import { initialRedeemState } from "../state";

/**
 * The validation + redemption screen (spec §34 Phase 8 "merchant validation").
 * The visitor reads out (or shows) their code; staff type or paste it here. The
 * server re-validates scope, expiry, and prior redemption — a code that looks
 * fine here is still rejected there if it isn't this merchant's to redeem.
 */
export function RedeemForm({ merchantId }: { merchantId?: string }) {
  const action = merchantId ? redeemAsMerchantAction : redeemAsOrganizerAction;
  const [state, submit] = useActionState(action, initialRedeemState);

  return (
    <div className="grid gap-4">
      <form action={submit} className="grid gap-4">
        {merchantId ? <input type="hidden" name="merchantId" value={merchantId} /> : null}

        <FormField
          name="code"
          label="Voucher code"
          placeholder="e.g. 7F2K9QW4XM"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="[&_input]:font-mono [&_input]:tracking-widest [&_input]:uppercase"
        />

        <div className="grid gap-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={2} placeholder="Order number, staff name…" />
        </div>

        <SubmitButton className="justify-self-start" pendingText="Checking…">
          Redeem
        </SubmitButton>
      </form>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? (
        <div className="rounded-lg border border-green-600/40 bg-green-50 p-4 dark:bg-green-950/30">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            ✓ Redeemed — {state.discountLabel}
          </p>
          <p className="mt-1 text-sm">{state.title}</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs tracking-widest">
            {state.code}
          </p>
        </div>
      ) : null}
    </div>
  );
}
