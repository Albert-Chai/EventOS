"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { ITEM_AVAILABILITIES, ITEM_AVAILABILITY_LABELS } from "@/server/merchants/status";

import { addItemAction, updateItemAction } from "../portal-actions";
import { initialMerchantFormState } from "../state";

export type ItemView = {
  id: string;
  name: string;
  description: string;
  price: string;
  promoPrice: string;
  currency: string;
  dietaryTags: string;
  isHalal: boolean;
  availability: string;
};

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3";

export function ItemForm({
  merchantId,
  participationId,
  item,
}: {
  merchantId: string;
  participationId: string;
  item?: ItemView;
}) {
  const isEdit = Boolean(item);
  const [state, submit] = useActionState(
    isEdit ? updateItemAction : addItemAction,
    initialMerchantFormState,
  );
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={submit} className="grid gap-3">
      {state.status === "error" && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "success" && state.message ? (
        <Alert role="status">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="participationId" value={participationId} />
      {item ? <input type="hidden" name="itemId" value={item.id} /> : null}

      <FormField
        name="name"
        label="Item name"
        required
        defaultValue={item?.name ?? ""}
        errors={fieldErrors.name}
        placeholder="Nasi Lemak Ayam"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          name="price"
          label="Price"
          inputMode="decimal"
          defaultValue={item?.price ?? ""}
          errors={fieldErrors.price}
          placeholder="12.00"
        />
        <FormField
          name="promoPrice"
          label="Promo price"
          inputMode="decimal"
          defaultValue={item?.promoPrice ?? ""}
          errors={fieldErrors.promoPrice}
          placeholder="9.90"
        />
        <FormField
          name="currency"
          label="Currency"
          defaultValue={item?.currency ?? "MYR"}
          errors={fieldErrors.currency}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`availability-${item?.id ?? "new"}`}>Availability</Label>
          <select
            id={`availability-${item?.id ?? "new"}`}
            name="availability"
            defaultValue={item?.availability ?? "available"}
            className={SELECT_CLASS}
          >
            {ITEM_AVAILABILITIES.map((a) => (
              <option key={a} value={a}>
                {ITEM_AVAILABILITY_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <FormField
          name="dietaryTags"
          label="Dietary tags"
          hint="Comma-separated, e.g. vegetarian, spicy."
          defaultValue={item?.dietaryTags ?? ""}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isHalal"
          defaultChecked={item?.isHalal ?? false}
          className="size-4"
        />
        Halal
      </label>

      <div className="grid gap-2">
        <Label htmlFor={`description-${item?.id ?? "new"}`}>Description</Label>
        <Textarea
          id={`description-${item?.id ?? "new"}`}
          name="description"
          rows={2}
          defaultValue={item?.description ?? ""}
        />
      </div>

      <SubmitButton className="justify-self-start" size="sm" pendingText="Saving…">
        {isEdit ? "Save item" : "Add item"}
      </SubmitButton>
    </form>
  );
}
