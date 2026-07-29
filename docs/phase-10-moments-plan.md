# Phase 10 — Moments (visitor posts) + visitor accounts

Visitors share what they ate and saw at an event: a photo, a caption, the stall
it came from, and a star rating. The feed is its own tab in the visitor app.

Scope decided with the product owner:

| Question              | Decision                                                          |
| --------------------- | ----------------------------------------------------------------- |
| Auth                  | **Sign in to post, browse freely** — reading needs no account      |
| Moderation            | **Live immediately**, organiser can hide (post-moderation)         |
| Post contents         | Photo + caption, tag a stall, 1–5 star rating, **text-only is ok** |
| Placement             | **Its own bottom-nav tab** — no stall-page strip, no landing strip |
| Explicitly out        | Likes, comments, follows, notifications                            |

---

## 1. Visitor accounts — the seam

There is exactly **one identity pool**: `auth.users`. An organizer and a visitor
are the same kind of account; what differs is what they're a member of. A
visitor simply has no `tenant_members` row, so they have no dashboard — nothing
new to secure.

The visitor-facing surface is `visitors`, which already carried a nullable
`user_id` reserved for precisely this (see the comment block in
`schema/visitors.ts`). Linking is the whole feature:

```
anonymous browsing           →  cookie only, no DB row          (unchanged)
favourite / claim a voucher  →  visitors row, user_id NULL      (unchanged)
sign in                      →  visitors row, user_id = auth uid   (new)
```

`resolveSignedInVisitor()` (`services/visitor-account.service.ts`) is the only
writer of that link:

1. Look the visitor up **by `user_id`** first. This is what makes the account
   portable — signing in on a second device finds the same row rather than
   forking a new identity per cookie.
2. Otherwise adopt the cookie's visitor row and set `user_id` on it, carrying
   the display name and email across from `profiles`. An anonymous visitor who
   signs up keeps their favourites.
3. Otherwise create a row for the account.

A partial unique index on `visitors(user_id) WHERE user_id IS NOT NULL` makes
"one visitor per account" a database guarantee, not a convention.

**Reuse, don't rebuild.** Visitor sign-in goes through the existing audited auth
actions at `/sign-in` and `/sign-up`, with `?next=` pointing back into the event.
No second auth implementation, no second password path, no new open-redirect
surface — `safeRedirectPath` already governs `next`.

Known, accepted limitation: a second device's *anonymous* favourites are not
merged on sign-in. Merging two anonymous histories is a distinct feature with
its own conflict rules; forking identity silently would be worse.

## 2. Data model — `moment_posts`

Tenant-scoped like every other table (`tenant_id`, `created_at`, `updated_at`,
`set_updated_at` trigger, `REVOKE ALL … FROM anon, authenticated`).

| Column             | Notes                                                    |
| ------------------ | -------------------------------------------------------- |
| `event_id`         | the post always belongs to one event                     |
| `visitor_id`       | the author; ownership checks compare against this         |
| `author_user_id`   | cross-schema FK to `auth.users`, `ON DELETE SET NULL`     |
| `participation_id` | the tagged stall, nullable, `ON DELETE SET NULL`          |
| `image_file_id`    | nullable — text-only posts are allowed                    |
| `body`             | nullable caption, ≤ 500 chars                             |
| `rating`           | nullable `smallint`, 1–5                                  |
| `status`           | `published` \| `hidden` \| `deleted`                      |
| `hidden_*`         | who hid it, when, and why — moderation is accountable     |

Three CHECK constraints carry rules the UI must never be the only enforcer of:

- `rating BETWEEN 1 AND 5`
- `rating IS NULL OR participation_id IS NOT NULL` — a rating is *about a stall*;
  a star floating free of a subject is meaningless data.
- a post has a non-blank body **or** an image. "Text-only allowed" is not "empty
  allowed".

`status` is `text` + a TS union, per the §12 convention (statuses grow; altering
a Postgres enum in place does not).

### The pure ↔ SQL split

`server/moments/status.ts` holds `isPubliclyVisible(status)`; the repository
holds `visiblePredicate()`. Same rule, two forms, unit-tested together — the
same shape as `eventPhase ↔ phaseExpr` and `isBookingLive ↔ livePredicate`.

## 3. Authorization

- **Posting** requires a signed-in user, and the post is written against *their*
  visitor row — `visitor_id` is derived server-side, never submitted.
- **Deleting your own post** compares `post.visitor_id` to the caller's resolved
  visitor id. A visitor cannot address another visitor's post.
- **Hiding** is an organiser action behind a new permission, `moment.moderate`
  (owner, event manager, marketing). Permissions stay code, not data.
- Both hide and restore are **audited** (`moment.hidden`, `moment.restored`).
  Visitor posting is not audited — §23 is for actor state-changes on the
  organizer's own data, not visitor content; the analytics log covers volume.

## 4. Feature gating

A new per-event toggle, `enable_moments` (default **off**). A disabled feed
**404s** rather than explaining itself — the same rule vouchers follow, so a
disabled surface is indistinguishable from a nonexistent one.

The bottom-nav tab is likewise conditional: tabs render only for features the
event actually has turned on, which also keeps the bar from overflowing at
390px now that there are six candidates.

## 5. Media

Images go through the existing `uploadImage` seam with a **server-constructed**
scope, `events/{eventId}/moments`, owned by the post id. The client never
influences the object path (§6), and the `files` row is written through the
repository with a scoped `tenant_id` like every other upload.

Because a visitor is not a `TenantScopedContext`, `uploadImage` is called with
the request context plus the event's own `tenant_id` — derived from
`findPublicEvent`, never a client value. This is the same public-write seam as a
voucher claim, documented at the call site.

Two consequences worth stating plainly rather than discovering later:

- **Visitor photos count against the organizer's storage limit** (§22). That is
  the honest accounting — the bytes are in their bucket — but it means a busy
  feed can push a workspace toward its cap. If that becomes a real problem the
  fix is a separate `moment_photo` metric, not silently free storage.
- The `files` row is audited as `file.uploaded` **against the event's tenant**,
  with the visitor as actor. Posting itself is not audited; the upload is,
  because it consumes the organizer's quota.

A photo-only post uploads **before** the insert: it has no other content, so a
two-step write would trip `moment_posts_has_content_ck`.

## 6. Analytics

Two names added to the §25 taxonomy:

- `moment_feed_viewed` — a view-type event, so it joins `CLIENT_TRACKABLE`.
- `moment_posted` — state-changing, emitted **server-side only** inside
  `createMomentPost`, so the public beacon cannot forge it.

## 7. Surfaces

| Route                                       | Who        |
| ------------------------------------------- | ---------- |
| `/{tenant}/{event}/moments`                 | anyone     |
| `/{tenant}/{event}/moments/new`             | signed in  |
| `/dashboard/events/{id}/moments`            | moderators |

The composer is a full page rather than an inline box: on a phone, a photo
picker plus stall search plus rating needs the room.

### The feed's own surface

The rest of the visitor app is cards floating on a soft grey ground. A photo
feed wants the opposite — white page, full-bleed media, hairline rules — so
nothing competes with the pictures. That's the `.moments` scope in `globals.css`:
its own greys (`--feed-line`, `--feed-muted`, `--feed-ink`), cooler and higher
contrast than the app's, because separators on a photo surface should disappear
while metadata over white stays legible. `--brand` still comes from the event, so
a feed reads as *this* festival's.

Post anatomy, in reading order: who posted → the tagged stall as the location
line → media at full bleed, cropped to 4:5 so the column doesn't jump between
posts → the rating → `**name** caption` → timestamp. A text-only post gets a
typographic frame of the same weight rather than a bare paragraph, so it holds
its place in the rhythm.

Feed/Grid is a `?view=` param, not client state: it survives a share, a refresh,
and the back button, and costs no JavaScript. The author's overflow menu is a
`<details>`, so it opens and submits without hydration.

## 9. Likes and comments

Added after the first cut. Two tables, both cascading from the post:

`moment_likes` is append/delete only — no `updated_at`, no trigger, no status. A
like has no states; it exists or it doesn't. `unique(moment_post_id, visitor_id)`
is the whole integrity story, and `onConflictDoNothing` against it is what makes
a double-tap idempotent rather than a duplicate row. The count is derived from
rows, so a second row would be a *wrong number*, not just clutter.

`moment_comments` deliberately mirrors `moment_posts`: same status union, same
accountable `hidden_*` trio, same blank-body CHECK (using the corrected
`~ '[^[:space:]]'` predicate from 0022, not `btrim`). A comment is visitor
content on the organizer's event exactly as a post is, and two moderation
stories for one surface is a mistake waiting to happen.

### Liking requires an account

Favourites are anonymous; likes are not. The difference is that a favourite is
*private to the person* while a like is a *public count* — one anyone could
inflate by clearing a cookie would be worse than no count at all, and
`unique(post, visitor)` only means something when the visitor is an account
rather than a disposable identity. A signed-out reader gets a link to sign-in
where the button would be, never a control that silently does nothing.

### Removing a comment

`canRemoveComment` allows the person who wrote it **or** whoever's post it's on.
The second half is the point: your post is your space, and waiting for an
organiser to hide a nasty reply is not a moderation story. The organiser can
still hide either, audited as `moment.comment_hidden` / `..._restored`.

### Counting without an N+1

The feed needs three numbers per post — likes, comments, did-I-like-it — plus a
one-line preview of the newest comment. Done naively that's four queries per
post; on a 60-post feed against a **single-connection** pooler, that's a stall.
Instead it's two queries for the whole page: one correlated-subquery pass for
the counts, and one `DISTINCT ON` for the newest comment per post.

### Surfaces

`/{tenant}/{event}/moments/{postId}` is the post page — where the comment icon,
"view all N comments", and every grid tile land. A hidden or deleted post 404s
there exactly as it vanishes from the feed, so a direct link can never reveal
what moderation removed.

**Still not built:** follows, notifications, replies-to-comments, and likes on
comments.

**Worth stating:** likes and comments are cheap, high-volume, authenticated
writes with **no application rate limiting** (the standing §6 gap — needs Redis).
Supabase's auth limits bound account creation, not what an account does once
signed in.

## 8. Out of scope, deliberately

Likes, comments, follows, and post notifications. Reporting/flagging by
visitors — organiser moderation is the moderation story for now. Feeds across
events. Video.
