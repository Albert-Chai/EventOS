import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MediaImage } from "@/components/media/media-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { moderateCommentAction, moderateMomentAction } from "@/features/moments/dashboard-actions";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { MOMENT_STATUS_LABELS, type MomentStatus } from "@/server/moments/status";
import {
  listCommentQueue,
  listModerationQueue,
  stallRatings,
} from "@/server/services/moment.service";
import { publicFileUrl } from "@/server/services/media.service";

export const metadata: Metadata = {
  title: "Moments",
  robots: { index: false, follow: false },
};

/**
 * Moderation for the visitor feed (docs/phase-10-moments-plan.md §3).
 *
 * Post-moderation by design: posts go live immediately and the organiser takes
 * them down. Hiding is reversible and audited — the trail records who hid what
 * and why. A post the author deleted is theirs and cannot be "restored" here.
 */
export default async function EventMomentsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const base = `/dashboard/events/${eventId}/moments`;
  const ctx = await requirePermissionOrRedirect("moment.moderate", base);

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();

  // Sequential: the dev/test pooler caps at one connection.
  const settings = await getEventSettings(ctx.tenant.id, eventId);
  const posts = await listModerationQueue(ctx, eventId);
  const comments = await listCommentQueue(ctx, eventId);
  const ratings = await stallRatings(ctx, eventId);

  const live = posts.filter((p) => p.status === "published").length;
  const hidden = posts.filter((p) => p.status === "hidden").length;
  const liveComments = comments.filter((c) => c.status === "published").length;
  const hiddenComments = comments.filter((c) => c.status === "hidden").length;
  const ratedStalls = ratings.length;
  const overall =
    ratings.length > 0
      ? Math.round(
          (ratings.reduce((sum, r) => sum + r.average * r.count, 0) /
            ratings.reduce((sum, r) => sum + r.count, 0)) *
            10,
        ) / 10
      : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Moments</h1>
        <p className="text-muted-foreground text-sm">
          Photos and reviews posted by signed-in visitors. Posts appear immediately; hide anything
          that breaks your rules — it&apos;s reversible, and every decision is recorded in the audit
          log.
        </p>
      </div>

      {!settings?.enableMoments ? (
        <Card>
          <CardHeader>
            <CardTitle>Moments are switched off</CardTitle>
            <CardDescription>
              The feed is hidden from visitors and its page returns a 404. Turn it on in{" "}
              <Link
                href={`/dashboard/events/${eventId}/settings`}
                className="font-medium underline underline-offset-4"
              >
                event settings
              </Link>{" "}
              to let visitors post.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Feed</CardTitle>
          <CardDescription>
            {live} live · {hidden} hidden
            {overall !== null ? ` · ${overall}★ average across ${ratedStalls} rated stalls` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No posts yet. Visitors need to sign in before they can post.
            </p>
          ) : (
            <ul className="grid gap-3">
              {posts.map((post) => {
                const imageUrl =
                  post.imageBucket && post.imagePath
                    ? publicFileUrl({ bucket: post.imageBucket, path: post.imagePath })
                    : null;
                const status = post.status as MomentStatus;
                return (
                  <li key={post.id} className="flex min-w-0 gap-3 rounded-lg border p-3">
                    {imageUrl ? (
                      <MediaImage
                        src={imageUrl}
                        alt=""
                        width={96}
                        height={96}
                        className="size-20 shrink-0 object-cover"
                      />
                    ) : null}
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                        <span className="truncate text-sm font-medium">
                          {post.authorName ?? "Visitor"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {post.createdAt.toLocaleString()}
                        </span>
                        <span
                          className={
                            status === "published"
                              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                              : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold"
                          }
                        >
                          {MOMENT_STATUS_LABELS[status] ?? status}
                        </span>
                      </div>
                      {post.merchantName ? (
                        <p className="text-muted-foreground text-xs">
                          {post.merchantName}
                          {post.rating ? ` · ${post.rating}★` : ""}
                        </p>
                      ) : null}
                      {post.body ? <p className="text-sm">{post.body}</p> : null}
                      {post.hiddenReason ? (
                        <p className="text-muted-foreground text-xs italic">
                          Hidden: {post.hiddenReason}
                        </p>
                      ) : null}

                      {status !== "deleted" ? (
                        <form action={moderateMomentAction} className="mt-1 flex flex-wrap gap-2">
                          <input type="hidden" name="eventId" value={eventId} />
                          <input type="hidden" name="postId" value={post.id} />
                          <input
                            type="hidden"
                            name="action"
                            value={status === "published" ? "hide" : "restore"}
                          />
                          {status === "published" ? (
                            <input
                              name="reason"
                              placeholder="Reason (optional)"
                              maxLength={200}
                              className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                            />
                          ) : null}
                          <Button type="submit" variant="outline" size="sm">
                            {status === "published" ? "Hide" : "Restore"}
                          </Button>
                        </form>
                      ) : (
                        <p className="text-muted-foreground text-xs">Deleted by its author.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>
            {liveComments} live · {hiddenComments} hidden. Visitors can also remove comments on
            their own posts, which is usually faster than waiting for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No comments yet.</p>
          ) : (
            <ul className="grid gap-2">
              {comments.map((comment) => {
                const status = comment.status as MomentStatus;
                return (
                  <li key={comment.id} className="grid min-w-0 gap-1 rounded-lg border p-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                      <span className="truncate text-sm font-medium">
                        {comment.authorName ?? "Visitor"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {comment.createdAt.toLocaleString()}
                      </span>
                      <span
                        className={
                          status === "published"
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"
                            : "bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold"
                        }
                      >
                        {MOMENT_STATUS_LABELS[status] ?? status}
                      </span>
                    </div>
                    <p className="text-sm">{comment.body}</p>
                    <p className="text-muted-foreground truncate text-xs italic">
                      on: {comment.postBody ?? "a photo"}
                    </p>
                    {comment.hiddenReason ? (
                      <p className="text-muted-foreground text-xs italic">
                        Hidden: {comment.hiddenReason}
                      </p>
                    ) : null}

                    {status !== "deleted" ? (
                      <form action={moderateCommentAction} className="mt-1 flex flex-wrap gap-2">
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="commentId" value={comment.id} />
                        <input
                          type="hidden"
                          name="action"
                          value={status === "published" ? "hide" : "restore"}
                        />
                        {status === "published" ? (
                          <input
                            name="reason"
                            placeholder="Reason (optional)"
                            maxLength={200}
                            className="border-input bg-background h-8 rounded-md border px-2 text-xs"
                          />
                        ) : null}
                        <Button type="submit" variant="outline" size="sm">
                          {status === "published" ? "Hide" : "Restore"}
                        </Button>
                      </form>
                    ) : (
                      <p className="text-muted-foreground text-xs">Removed by its author.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
