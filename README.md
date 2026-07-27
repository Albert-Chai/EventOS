# EventOS

White-label, multi-tenant event discovery and merchant platform for festivals,
night markets, expos, and fairs.

- **Specification:** [EventOS_PROJECT.md](EventOS_PROJECT.md)
- **Engineering rules:** [CLAUDE.md](CLAUDE.md)
- **Architecture:** [docs/architecture.md](docs/architecture.md)
- **Database:** [docs/database.md](docs/database.md)
- **Current phase:** Phase 8 complete — **all nine §34 build phases (0–8) are done**. The last added vouchers & campaigns (claim, redeem, campaign reporting) — see [docs/phase-8-plan.md](docs/phase-8-plan.md)

---

## Stack

| Layer      | Choice                                               |
| ---------- | ---------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling    | Tailwind CSS v4, shadcn/ui (Base UI)                 |
| Database   | Supabase Postgres, Drizzle ORM                       |
| Auth       | Supabase Auth via `@supabase/ssr`, HTTP-only cookies |
| Storage    | Supabase Storage (S3-compatible)                     |
| Validation | Zod 4                                                |
| Tests      | Vitest (unit), Playwright (e2e)                      |
| Hosting    | Vercel                                               |

---

## Getting started

### Prerequisites

**Node 22+** is required — `@supabase/supabase-js` refuses to run on Node 20
(EOL since April 2026, no native WebSocket). The repo pins it via `.nvmrc`:

```bash
nvm install   # reads .nvmrc → Node 22
nvm use
corepack enable   # provides pnpm on this Node version
```

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com), or use an existing
   one. Note its region — the pooler host in your connection string must match
   it (this project runs in `ap-south-1`).
2. **Storage → New bucket** → name it `eventos-public`, mark it public.
3. **Authentication → URL Configuration** → set the Site URL to
   `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the
   redirect allow-list.

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API** and **→ Database**:

| Variable                               | Where                                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | API → Project URL                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | API Keys → **publishable** (`sb_publishable_…`)            |
| `SUPABASE_SECRET_KEY`                  | API Keys → **secret** (`sb_secret_…`) — **server-only**    |
| `DATABASE_URL`                         | Database → Connection string → **Transaction** (port 6543) |
| `DIRECT_DATABASE_URL`                  | Database → Connection string → **Session** (port 5432)     |

Every value is validated at build time — a missing or malformed one fails the
build rather than the first request.

### 3. Install, migrate, seed, run

```bash
pnpm install
pnpm db:migrate    # profiles, tenants, roles, audit, events, merchants, booths/maps — all migrations
pnpm db:seed       # accounts, a platform admin, a workspace, 2 events, a merchant, a floor plan + booths
pnpm dev
```

Sign in at http://localhost:3000 (password `eventos-dev-password` for all):

- `organizer.owner@eventos.test` — owner of the demo workspace
- `organizer.staff@eventos.test` — event manager in it (fewer permissions)
- `platform.admin@eventos.test` — platform admin → `/platform`
- `merchant.owner@eventos.test` — merchant → `/merchant` (manages Nasi Lemak Bangsar)

The seeded workspace ships a published event with an approved merchant, a floor
plan, booths, a confirmed booth assignment, a demo visitor with a saved merchant,
the tenant on the **Growth** plan with that merchant featured, and ~5 days of
seeded analytics (event log + daily rollups) plus two trackable QR codes. Sign in
as `organizer.owner@eventos.test` to see `/dashboard/billing` (plan, usage,
invoices) and each event's **Analytics** tab; `merchant.owner@eventos.test` sees
`/merchant/<id>/analytics`. Public pages:

- `/kl-food-weekend` — the workspace's public event index
- `/kl-food-weekend/street-eats` — a published event (the draft `404`s)
- `/kl-food-weekend/street-eats/nasi-lemak-bangsar` — an approved merchant listing
- `/kl-food-weekend/street-eats/map` — the interactive booth map (tap booth A-1)
- `/kl-food-weekend/street-eats/merchants` — the searchable merchant directory
- `/kl-food-weekend/street-eats/favourites` — saved merchants (set the cookie
  `eventos_vid=seed-demo-visitor` to see the seeded favourite)
- `/kl-food-weekend/street-eats/vouchers` — claimable vouchers
- `/kl-food-weekend/street-eats/vouchers/mine` — claimed codes, with QR
- `/q/seedmrc1` — a trackable QR redirect to the merchant listing (logs a scan)

The seeded code `SEEDNASI02` is unredeemed — try it as `merchant.owner@eventos.test`
at `/merchant/<id>/redeem` to see the validation flow (a second attempt is refused).

### 4. Optional — Google sign-in

Enable Google in **Authentication → Providers**, then set
`AUTH_GOOGLE_ENABLED=true`. The button stays hidden until you do, so there is no
broken flow in the meantime.

---

## Scripts

| Command            | Purpose                                               |
| ------------------ | ----------------------------------------------------- |
| `pnpm dev`         | Development server                                    |
| `pnpm verify`      | Typecheck + lint + unit tests — run before committing |
| `pnpm test`        | Unit tests                                            |
| `pnpm test:e2e`    | Playwright end-to-end tests                           |
| `pnpm db:generate` | Generate a migration from schema changes              |
| `pnpm db:migrate`  | Apply pending migrations                              |
| `pnpm db:seed`     | Development fixtures (refuses to run in production)   |
| `pnpm db:studio`   | Drizzle Studio                                        |
| `pnpm format`      | Prettier                                              |

---

## Project layout

```
src/
├── app/                    routes
│   ├── (auth)/             sign-in, sign-up, password reset
│   ├── (dashboard)/        authenticated organizer area (events, merchants, team, …)
│   ├── (platform)/         platform-admin console
│   ├── (public)/           visitor pages — /{tenant}/{event}[/{merchant}|/map]
│   ├── merchant/           merchant portal — /merchant/{merchantId}/…
│   ├── q/                  trackable QR redirect — /q/{shortCode}
│   ├── auth/callback/      OAuth + email link exchange
│   └── api/                health probes + /api/cron/{aggregate-metrics,run-scheduler}
├── components/
│   ├── ui/                 shadcn primitives
│   └── forms/              Server-Action-friendly field wrappers
├── features/auth/          actions, schemas, components
├── server/
│   ├── auth/               Supabase clients, session resolution
│   ├── context.ts          RequestContext — the tenant-isolation seam
│   ├── db/
│   │   ├── schema/         Drizzle tables
│   │   └── repositories/   the ONLY importers of `db`
│   ├── policies/           requireUser and friends
│   ├── services/           business logic
│   └── telemetry/          structured logger
├── lib/api/                response envelope, error codes, handler
├── config/                 environment validation
└── proxy.ts                session refresh + coarse route guard
```

---

## Testing

```bash
pnpm test          # unit — no external services required
pnpm test:e2e      # end-to-end — builds and starts the app
```

The route-guard, validation, and header e2e tests need no credentials. The full
sign-in journey needs a live Supabase project with seeded users; without one it
**skips with a reason** rather than passing silently.

---

## CI

`.github/workflows/ci.yml` runs typecheck, lint, format check, unit tests, and
build on every push and pull request, using placeholder environment values so
that env validation itself is exercised.

The e2e job runs only when `E2E_SUPABASE_URL` and its companion secrets are
configured; otherwise it emits a warning saying the tests were skipped.

---

## Deployment (Vercel)

1. Import the repository.
2. Add every variable from `.env.example` (real values).
3. Set `NEXT_PUBLIC_APP_URL` to the deployed URL.
4. Add `https://<your-domain>/auth/callback` to the Supabase redirect allow-list.
5. Run `pnpm db:migrate` against the production database as a release step.

---

## Roadmap

| Phase | Scope                                                             | Status      |
| ----- | ----------------------------------------------------------------- | ----------- |
| 0     | Foundation — auth, database, CI, API contract                     | ✅ Complete |
| 1     | Multi-tenant platform — tenants, RBAC, audit logs, impersonation  | ✅ Complete |
| 2     | Event management — lifecycle, branding, settings, public pages    | ✅ Complete |
| 3     | Merchant onboarding — portal, listings, products, approval        | ✅ Complete |
| 4     | Booths and maps — zones, floor plans, assignment, interactive map | ✅ Complete |
| 5     | Visitor experience — directory search, favourites, recently-viewed, PWA | ✅ Complete |
| 6     | Monetization — plans, usage limits, simulated billing, featured listings | ✅ Complete |
| 7     | Analytics — event log, organizer & merchant dashboards, QR tracking, CSV export | ✅ Complete |
| 8     | Vouchers and campaigns — claim, redeem, campaign reporting        | ✅ Complete |
