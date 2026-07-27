"use client";

import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { VOUCHER_TYPES, VOUCHER_TYPE_LABELS } from "@/server/vouchers/status";

import { createVoucherAction } from "../actions";
import { initialVoucherFormState } from "../state";

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

/**
 * Create-voucher form. The value field shown follows the selected type — the
 * same rule the Zod schema enforces server-side, so the client can't submit a
 * percent voucher with no percentage and the server rejects it if it tries.
 */
export function VoucherForm({
  eventId,
  merchants,
}: {
  eventId: string;
  merchants: { id: string; name: string }[];
}) {
  const [state, submit] = useActionState(createVoucherAction, initialVoucherFormState);
  const [voucherType, setVoucherType] = useState<string>("discount_percent");

  return (
    <form action={submit} className="grid gap-4">
      <input type="hidden" name="eventId" value={eventId} />

      {state.status === "error" && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <FormField
        name="title"
        label="Title"
        placeholder="RM5 off your first order"
        required
        errors={state.fieldErrors?.title}
      />

      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="voucherType">Type</Label>
          <select
            id="voucherType"
            name="voucherType"
            className={SELECT_CLASS}
            value={voucherType}
            onChange={(e) => setVoucherType(e.target.value)}
          >
            {VOUCHER_TYPES.map((type) => (
              <option key={type} value={type}>
                {VOUCHER_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {voucherType === "discount_percent" ? (
          <FormField
            name="discountPercent"
            label="Discount (%)"
            type="number"
            min={1}
            max={100}
            placeholder="20"
            errors={state.fieldErrors?.discountPercent}
          />
        ) : null}
        {voucherType === "discount_amount" ? (
          <FormField
            name="discountAmount"
            label="Discount (MYR)"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="5.00"
            errors={state.fieldErrors?.discountAmount}
          />
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="merchantId">Merchant</Label>
        <select id="merchantId" name="merchantId" className={SELECT_CLASS} defaultValue="">
          <option value="">Event-wide — any merchant can redeem</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          A merchant-specific voucher can only be redeemed by that merchant.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="startsAt"
          label="Starts"
          type="datetime-local"
          errors={state.fieldErrors?.startsAt}
        />
        <FormField
          name="endsAt"
          label="Ends"
          type="datetime-local"
          errors={state.fieldErrors?.endsAt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          name="totalQuantity"
          label="Total available"
          type="number"
          min={1}
          placeholder="Leave blank for unlimited"
          errors={state.fieldErrors?.totalQuantity}
        />
        <FormField
          name="perVisitorLimit"
          label="Per visitor"
          type="number"
          min={1}
          max={100}
          defaultValue={1}
          errors={state.fieldErrors?.perVisitorLimit}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="terms">Terms</Label>
        <Textarea id="terms" name="terms" rows={2} placeholder="One per person. Not valid with other offers." />
      </div>

      <SubmitButton className="justify-self-start" pendingText="Creating…">
        Create voucher
      </SubmitButton>
    </form>
  );
}
