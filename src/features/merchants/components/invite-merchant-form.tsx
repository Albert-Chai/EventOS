"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";

import { inviteMerchantAction } from "../actions";
import { initialMerchantFormState } from "../state";

/**
 * Sends a claim-by-email invitation and surfaces the link to share (no
 * transactional email until it's wired — same as team invites).
 */
export function InviteMerchantForm({ merchantId }: { merchantId: string }) {
  const [state, submit] = useActionState(inviteMerchantAction, initialMerchantFormState);

  return (
    <form action={submit} className="grid gap-3">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert role="status">
          <AlertDescription className="grid gap-2">
            <span>{state.message}</span>
            {state.inviteUrl ? (
              <code className="bg-muted block overflow-x-auto rounded px-2 py-1.5 text-xs">
                {state.inviteUrl}
              </code>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <input type="hidden" name="merchantId" value={merchantId} />
      <FormField
        name="email"
        label="Contact email"
        type="email"
        required
        placeholder="owner@merchant.example"
      />
      <SubmitButton className="justify-self-start" size="sm" pendingText="Creating…">
        Send claim invite
      </SubmitButton>
    </form>
  );
}
