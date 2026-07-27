# Brevo as the campaign email provider

**Status:** evaluated, not yet implemented. This is the integration plan for turning
Phase 8's *simulated* campaign delivery into real email via Brevo.

**TL;DR:** Brevo fits the `NotificationProvider` seam cleanly and is a legitimate
choice where Supabase email was rightly rejected. Writing the adapter is small.
**But** shipping real sends is *not* "one adapter + a key" as the seam comment
claims — the audience model has no email addresses to send to. That gap is the
real work. See [§4](#4-the-real-blocker-there-are-no-addresses-to-send-to).

---

## 1. Verdict

| Question | Answer |
| --- | --- |
| Can Brevo send campaign email? | Yes — via its **transactional** API (`POST /v3/smtp/email`). |
| Does it fit our seam? | Yes — one `NotificationProvider` adapter, selected in `getNotificationProvider`. |
| Is it a §6-legitimate provider? | Yes. Unlike Supabase email (auth-transactional only, account-creating), Brevo has a real "send this content to this recipient" API. |
| New dependency needed? | No — a raw `fetch` adapter avoids `@getbrevo/brevo` (CLAUDE.md §7 rule 8). |
| Is it enough to flip delivery on? | **No.** No recipient in any audience has an email address today (§4). |

---

## 2. Why Brevo (and why the transactional API, not "Campaigns")

Brevo exposes two different products:

- **Transactional email** — `POST /v3/smtp/email`. Send one message, get a
  `messageId`. **This is the one we want.** It maps 1:1 onto our
  `OutboundMessage → SendResult` (`providerRef` = Brevo's `messageId`).
- **Marketing Campaigns** — `POST /v3/emailCampaigns`. Brevo owns the contact
  list, scheduling, and reporting. **Avoid it.** EventOS already owns
  `campaign_audiences`, `notification_deliveries`, and reporting
  (`summariseDeliveries`). Delegating that to Brevo would split our source of
  truth and break per-delivery reporting.

So despite the EventOS feature being called "campaigns", the correct Brevo
primitive is the **transactional endpoint**, called once per resolved recipient.

---

## 3. The adapter (the easy part)

### 3.1 API essentials

- **Endpoint:** `POST https://api.brevo.com/v3/smtp/email`
- **Auth header:** `api-key: <BREVO_API_KEY>` (server-only secret)
- **Other headers:** `accept: application/json`, `content-type: application/json`
- **Request body (core fields):**
  ```json
  {
    "sender":      { "name": "EventOS", "email": "no-reply@yourdomain.com" },
    "to":          [{ "email": "visitor@example.com", "name": "Optional" }],
    "subject":     "…",
    "htmlContent": "…",
    "textContent": "…"
  }
  ```
- **Response:** `200/201` with `{ "messageId": "<...>" }`. Errors return a JSON
  body with `code` + `message`.
- **Rate limits:** ~1,000 req/s on standard tiers — never a constraint for us.

> ⚠️ The Brevo API *reference* page (`/reference/sendtransacemail`) 404'd when
> fetched during evaluation, so confirm exact field names against the live
> reference before finalizing (`sender` vs `from`, `htmlContent` casing, etc.).

### 3.2 Env changes

`src/config/env-schema.ts`:
```ts
EMAIL_PROVIDER: z.enum(["supabase", "resend", "ses", "brevo"]).default("supabase"),
BREVO_API_KEY: optional,
// EMAIL_FROM already exists — it MUST be a Brevo-verified sender (see §5).
```
`src/config/env.ts` — add to `runtimeEnv`:
```ts
BREVO_API_KEY: process.env.BREVO_API_KEY,
```
The logger already redacts `*key`, so `BREVO_API_KEY` never leaks in logs.

### 3.3 The provider

Add to `src/server/notifications/provider.ts` and wire it into
`getNotificationProvider` next to the reserved Resend line:

```ts
const brevoProvider: NotificationProvider = {
  name: "brevo",
  delivers: true,
  async send(message) {
    if (message.channel !== "email") {
      return { ok: false, error: `brevo cannot deliver ${message.channel}` };
    }
    if (!message.to) {
      // Anonymous visitor with no address — caller should skip these (§4).
      return { ok: false, error: "recipient has no email address" };
    }
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY!,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: env.NEXT_PUBLIC_APP_NAME, email: env.EMAIL_FROM },
          to: [{ email: message.to }],
          subject: message.subject ?? "",
          htmlContent: message.body,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        return { ok: false, error: `brevo ${res.status}: ${detail.slice(0, 200)}` };
      }
      const json = (await res.json()) as { messageId?: string };
      return { ok: true, providerRef: json.messageId ?? null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "brevo request failed" };
    }
  },
};

export function getNotificationProvider(_channel: CampaignChannel): NotificationProvider {
  if (env.EMAIL_PROVIDER === "brevo" && env.BREVO_API_KEY && _channel === "email") {
    return brevoProvider;
  }
  return simulatedProvider; // missing key degrades to simulation, never throws
}
```

`deliveryIsSimulated()` then returns `false` automatically once the key is set,
so the UI's "simulated" notice disappears (required by CLAUDE.md §6).

Add unit tests mocking `fetch` for: success (`messageId` → `providerRef`),
non-2xx (error branch), thrown/network error, non-email channel, and null
recipient.

---

## 4. The real blocker: there are no addresses to send to

The seam comment says turning on real sending is "one adapter + a key, no
service change." **That is not accurate for the current code**, and this is the
part that actually needs design:

1. **`resolveAudience` returns `visitorId[]`, never email addresses**
   (`campaigns.repository.ts:115`). It reads `visitor_recent_views`,
   `visitor_favourites`, `voucher_claims` — all keyed by `visitor_id`.

2. **`visitors.email` exists but is never populated.** It was added for a future
   anonymous→account link that is deferred. `resolveVisitorForClaim()` takes no
   email; nothing in the repo/service layer writes `visitors.email`. So every
   audience today is effectively addressless.

3. **`sendCampaign` calls the provider ONCE with `to: null`, then bulk-marks
   every delivery "sent"** (`campaign.service.ts:165-177` +
   `markDeliveriesSent`). It never loops recipients. A real adapter dropped in
   as-is would be handed `to: null` a single time and send nothing.

### What real sending actually requires

- **Capture visitor email.** The natural place is the voucher-claim form (add an
  email field to the claim input + `resolveVisitorForClaim`, persist to
  `visitors.email`). Until then, only `claimed_voucher` audiences could ever have
  addresses — and only if we start collecting them. This has privacy/consent
  implications (§8.10) — collecting an email is a marketing opt-in, so gate it
  behind explicit consent.
- **Resolve audiences to addresses.** Add a repository query that returns
  `{ visitorId, email }`, filtering out null emails, and `log()` how many
  recipients were skipped for lack of an address (no silent truncation).
- **Send per recipient.** Rewrite the `sendCampaign` send step to iterate
  recipients, call `provider.send` per address, and record **per-delivery**
  status/`providerRef` instead of one bulk `markDeliveriesSent`. Keep it chunked
  (Brevo accepts batching via `messageVersions`, or just cap concurrency).
- **Opens/clicks/bounces** (the `opened`/`clicked`/`bounced` delivery statuses
  already modeled) require a **Brevo webhook** endpoint that updates
  `notification_deliveries` by `providerRef`. Guard it like the other cron/webhook
  routes (shared-secret / signature). This is a later increment — first send,
  then observe.

**Effort split:** the adapter is ~1 hour. The addressing + per-recipient send loop
+ consent-gated email capture is the real project — a day-plus, and it touches the
public claim flow, the schema (nullable→collected email), and the send loop.

---

## 5. Gotchas before going live

- **Free plan = 300 emails/day**, no rollover. Fine for a demo, not real load.
- **Sender authentication is mandatory for deliverability.** Verify a sender
  domain in Brevo and configure **DKIM** (SPF/DMARC recommended). `EMAIL_FROM`
  must be a Brevo-verified sender or mail silently lands in spam.
- **`EMAIL_FROM` must be set** — the adapter uses it as `sender.email`. It's
  already reserved in env-schema; make it required when `EMAIL_PROVIDER=brevo`.
- **Keep the "simulated" UI notice truthful** — it's driven by
  `deliveryIsSimulated()`, which flips correctly once the key + provider are set.
- **Usage metering already works** — `email_sends` bills against the plan quota
  in `sendCampaign` (§22). A per-recipient loop should bill actual successful
  sends, not the audience size.

---

## 6. Checklist

- [ ] Add `"brevo"` to `EMAIL_PROVIDER` enum + `BREVO_API_KEY` in `env-schema.ts`.
- [ ] Add `BREVO_API_KEY` to `runtimeEnv` in `env.ts`.
- [ ] Implement `brevoProvider` in `provider.ts`; select it in `getNotificationProvider`.
- [ ] Unit tests for the adapter (success / error / network / non-email / no-address).
- [ ] Verify a sender domain + DKIM in Brevo; set `EMAIL_FROM` to it.
- [ ] **Addressing:** consent-gated email capture at voucher claim → `visitors.email`.
- [ ] **Send loop:** audience query returning emails; per-recipient send + per-delivery status.
- [ ] Confirm exact Brevo request field names against the live API reference.
- [ ] (Later) Brevo webhook → open/click/bounce delivery-status updates.

---

## Sources

- Brevo getting started: <https://developers.brevo.com/docs/getting-started>
- Node SDK: `@getbrevo/brevo` (not used if we go raw `fetch`)
- Free-plan limits: <https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan>
- DKIM/transactional setup: <https://www.captaindns.com/en/blog/brevo-transactional-email-technical-guide>
