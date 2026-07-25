"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { EVENT_SETTING_KEYS, type EventSettings, type EventSettingKey } from "@/server/db/schema";

import { updateSettingsAction } from "../actions";
import { initialEventFormState } from "../state";

const META: Record<EventSettingKey, { label: string; hint: string }> = {
  requireVisitorLogin: {
    label: "Require visitor login",
    hint: "Visitors must sign in before browsing.",
  },
  enableFavourites: { label: "Favourites", hint: "Let visitors save merchants to a list." },
  enableReviews: { label: "Reviews", hint: "Allow visitor reviews (arrives in Phase 5)." },
  enableVouchers: { label: "Vouchers", hint: "Enable voucher campaigns (Phase 8)." },
  enableSponsors: { label: "Sponsors", hint: "Show sponsor placements on the event." },
  enablePassport: { label: "Passport", hint: "Enable a collect-stamps visitor passport." },
  enableMaps: { label: "Interactive map", hint: "Show the booth map (Phase 4)." },
  enableMerchantSelfRegistration: {
    label: "Merchant self-registration",
    hint: "Let merchants request to join without an invite.",
  },
  enableGuestBrowsing: { label: "Guest browsing", hint: "Allow browsing without an account." },
  showMerchantPrices: { label: "Show prices", hint: "Display merchant and product prices." },
  showBoothNumber: { label: "Show booth numbers", hint: "Display booth numbers on listings." },
  showOperatingHours: { label: "Show operating hours", hint: "Display the event's daily hours." },
  showSocialLinks: { label: "Show social links", hint: "Display merchant social links." },
};

export function SettingsForm({ eventId, settings }: { eventId: string; settings: EventSettings }) {
  const [state, submit] = useActionState(updateSettingsAction, initialEventFormState);

  return (
    <form action={submit} className="grid gap-5">
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

      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-1">
        {EVENT_SETTING_KEYS.map((key) => (
          <label
            key={key}
            className="hover:bg-muted/50 flex items-start gap-3 rounded-md p-2 text-sm"
          >
            <input
              type="checkbox"
              name={key}
              defaultChecked={settings[key]}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="font-medium">{META[key].label}</span>
              <span className="text-muted-foreground block text-xs">{META[key].hint}</span>
            </span>
          </label>
        ))}
      </div>

      <SubmitButton className="justify-self-start" pendingText="Saving…">
        Save settings
      </SubmitButton>
    </form>
  );
}
