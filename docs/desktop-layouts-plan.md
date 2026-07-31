# Desktop layouts for the visitor app

Spec §9 says every visitor view is **designed at 390px first**. That rule stands.
This work is purely **additive at `lg:`** — nothing below 1024px changes, and the
mobile design remains the one the layouts are derived from.

## The problem

At 1440px the visitor app is a 672px (`max-w-2xl`) column stranded in ~380px of
dead space either side, under a `max-w-5xl` header that doesn't align with it,
above a bottom tab bar clustered in the middle of a full-width white strip. The
directory wraps 21 category chips across four rows and lists 40 stalls one per
row. The floor plan is the only page that already uses the width, and even there
the search sheet is pinned to `max-w-2xl` at the bottom.

## Decisions

**Navigation: tabs move into the top header at `lg:`.** The bottom bar is a
mobile idiom; it stays under 1024px and is hidden above it, where the same tabs
render inline in the brand header. A left rail was considered and rejected: it
reads as an admin console, and it would compete with the directory's own filter
sidebar for the left edge.

**Layouts are real, not just wider.** Each page gets a structure that earns the
width (below), rather than a `max-w-2xl` → `max-w-6xl` swap.

## The blocker, and how it's resolved

The header lives in `(public)/layout.tsx`, which **cannot know the event** — and
the tab list depends on which features the event has switched on. Context won't
help: the header is a sibling _above_ `{children}`, not inside it.

So the header moves down to the segment that knows the event. After this change:

- `(public)/layout.tsx` — theme scope (`.appshell`) + PWA plumbing only.
- `[tenantSlug]/page.tsx` — renders `<AppHeader>` with **no** tabs.
- `[eventSlug]/layout.tsx` — renders `<AppHeader tabs={…}>` **and** `<BottomNav>`.

Only two places render the header, and both are places that already do the event
lookup. `<main>` moves down with it.

## One source of truth for the tabs

The active-tab matching (including "a merchant detail page counts as Stalls")
currently lives inside `bottom-nav.tsx`. With two navs rendering the same tabs it
gets extracted to a pure, unit-tested module — the same `pure ↔ component` split
used elsewhere in the codebase:

    src/features/visitors/nav-tabs.ts
      visitorTabs(features)     → the ordered specs an event should show
      eventBaseFromPath(path)   → "/tenant/event" | null
      activeTabKey(path)        → which tab the current path belongs to

Icons stay in the components; the module stays free of JSX so it can be tested
without pulling in React or `server-only`.

## Per-page desktop structure (all at `lg:`, ≥1024px)

Everything runs off a single container width, `max-w-6xl` (1152px), shared by the
header and every page, so the nav and the content align at every breakpoint. The
floor plan stays full-bleed.

| Page                  | Mobile (unchanged)            | Desktop                                                                                       |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| Event home            | stacked cards                 | Hero + a sticky when/where/hours rail; featured stalls 3-up                                    |
| Directory             | chips over 4 rows, 1-col list | Sticky **filter sidebar** (search, categories as a list, toggles, zones) + **2-col card grid** |
| Merchant detail       | stacked                       | Two columns — cover/identity/actions left, menu right                                          |
| Moments               | 470px feed                    | Feed column + **right rail**: event card, compose CTA, stalls in this feed                     |
| Floor plan            | bottom sheet                  | Sheet **docks to a left panel**, always open, map inset beside it                              |
| Favourites / Vouchers | 1-col                         | 2–3 col grids                                                                                  |

## Two things that changed during the build

**The directory grid is 2-up rows, not 3-up photo tiles.** A tile variant wants a
picture, and `searchDirectory` only returns `logoUrl` — no merchant has a logo
yet, so 3-up would be forty gradient placeholders. Two columns of the existing
row card use the width and keep the description, booth, halal/promo and price
that a tile would have to drop. Revisit when logos land: the card would need a
responsive row→tile shape rather than a second rendering, because duplicating the
markup duplicates `FavouriteButton` with it and the two copies desync on toggle.

**Event home reorders slightly on mobile.** The when/where/hours cards moved into
the desktop rail, which puts them after About and Featured on a phone rather than
between them. Preserving the old order would have meant interleaving two column
groups, which grid can't express without a staircase of empty rows. It's a fair
trade: the hero already carries the date and venue as chips, so these cards are
secondary detail. No other page's mobile order changes.

## Constraints carried over

- Mobile-first: every desktop rule is an `lg:` addition. No mobile class is
  removed to make desktop work.
- The nav is chrome, not authorization. Which tabs render still comes from event
  settings, and every page still enforces its own visibility (§1 rule 6).
- Content stays in one `<main>` per page so the skip target and the PWA shell
  don't change.
