import { env } from "@/config/env";
import { logger } from "@/server/telemetry/logger";
import type { CampaignChannel } from "@/server/campaigns/status";

/**
 * The delivery seam (spec §8.12, §10.4).
 *
 * Phase 8 ships **simulated** delivery only: a send records
 * `notification_deliveries` rows and marks them sent without contacting any
 * network. This is deliberate, not an oversight —
 *
 *  - No provider is configured here (`RESEND_API_KEY` unset, no VAPID keys), and
 *  - Supabase's built-in email is **auth-transactional only** (confirm, magic
 *    link, reset, invite). It is hard rate-limited and has no "send this content
 *    to this list" API; the only way to make it send arbitrary mail is to abuse
 *    `inviteUserByEmail`/`generateLink`, which creates accounts and mails auth
 *    links. That is the wrong tool for a campaign, so we do not build on it.
 *
 * Everything above this seam (campaign status machine, audiences, deliveries,
 * reporting) is real. Turning on real sending is one adapter implementing
 * `NotificationProvider` plus a key — no schema, service, or UI change.
 * `EMAIL_PROVIDER` already accepts `supabase｜resend｜ses` in `env-schema.ts`.
 */

export type OutboundMessage = {
  channel: CampaignChannel;
  /** Opaque recipient handle. Anonymous visitors have no address yet — see below. */
  to: string | null;
  subject: string | null;
  body: string;
};

export type SendResult = { ok: true; providerRef: string | null } | { ok: false; error: string };

export type NotificationProvider = {
  readonly name: string;
  /** True when messages actually leave the building. */
  readonly delivers: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
};

/**
 * Records the send and returns success without transmitting anything. Logs at
 * debug so a developer can see what *would* have gone out.
 */
const simulatedProvider: NotificationProvider = {
  name: "simulated",
  delivers: false,
  async send(message) {
    logger.debug("notification.simulated_send", {
      channel: message.channel,
      hasRecipient: Boolean(message.to),
      subject: message.subject,
    });
    return { ok: true, providerRef: null };
  },
};

/**
 * The provider for a channel. Always `simulated` today; when a real adapter
 * lands it is selected here on `EMAIL_PROVIDER` + the presence of its key, so a
 * missing key degrades to simulation rather than throwing mid-campaign.
 */
export function getNotificationProvider(_channel: CampaignChannel): NotificationProvider {
  // Reserved: `if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) return resendProvider;`
  void env.EMAIL_PROVIDER;
  return simulatedProvider;
}

/** Whether any real delivery is configured — drives the UI's "simulated" notice. */
export function deliveryIsSimulated(): boolean {
  return !getNotificationProvider("email").delivers;
}
