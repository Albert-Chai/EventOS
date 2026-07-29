import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { CommentForm } from "@/features/moments/components/comment-form";
import { CommentList } from "@/features/moments/components/comment-list";
import { MomentCard } from "@/features/moments/components/moment-card";
import { brandStyle } from "@/features/visitors/theme";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { getMomentDetail } from "@/server/services/moment.service";
import { getVisitorReader } from "@/server/services/visitor-account.service";

type Params = {
  params: Promise<{ tenantSlug: string; eventSlug: string; postId: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) return { title: "Not found", robots: { index: false, follow: false } };
  return {
    title: `Moment · ${event.name}`,
    // A single visitor post isn't something we want indexed on its own.
    robots: { index: false, follow: true },
  };
}

/**
 * One post and its comment thread — where the feed's comment icon, the "view all
 * comments" link, and every grid tile land.
 *
 * A hidden or deleted post 404s here exactly as it vanishes from the feed, so a
 * direct link can never reveal what moderation removed.
 */
export default async function MomentDetailPage({ params }: Params) {
  const { tenantSlug, eventSlug, postId } = await params;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  // Sequential: the dev/test pooler caps at one connection.
  const viewer = await getVisitorReader();
  const detail = await getMomentDetail({ tenantSlug, eventSlug }, postId, viewer?.visitorId ?? null);
  if (!detail) notFound();

  const branding = await getEventBranding(event.tenantId, event.id);
  const primary = branding?.primaryColor ?? "#e11d48";
  const baseHref = `/${event.tenantSlug}/${event.slug}`;
  const feedHref = `${baseHref}/moments`;
  const signInHref = `/sign-in?next=${encodeURIComponent(`${feedHref}/${postId}`)}`;

  return (
    <div className="moments min-h-dvh" style={brandStyle(primary)}>
      <div className="mx-auto w-full max-w-[470px]">
        <div className="sticky top-[57px] z-30 flex items-center gap-1 border-b border-[var(--feed-line)] bg-white/95 px-2 py-2 backdrop-blur">
          <Link
            href={feedHref}
            aria-label="Back to Moments"
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">Moment</h1>
        </div>

        <ul className="[&>li]:min-w-0">
          <MomentCard
            post={detail.post}
            baseHref={baseHref}
            tenantSlug={tenantSlug}
            eventSlug={eventSlug}
            canInteract={Boolean(viewer)}
            signInHref={signInHref}
            showComments={false}
          />
        </ul>

        <div className="border-t border-[var(--feed-line)] pb-32">
          <h2 className="px-3 pt-3 text-[11px] font-bold tracking-widest text-[var(--feed-muted)] uppercase">
            {detail.comments.length === 1 ? "1 comment" : `${detail.comments.length} comments`}
          </h2>
          <CommentList
            comments={detail.comments}
            tenantSlug={tenantSlug}
            eventSlug={eventSlug}
          />
        </div>

        {viewer ? (
          <CommentForm
            postId={postId}
            tenantSlug={tenantSlug}
            eventSlug={eventSlug}
            authorInitial={viewer.displayName.charAt(0).toUpperCase()}
          />
        ) : (
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-[470px] border-t border-[var(--feed-line)] bg-white px-3 py-3">
            <Link href={signInHref} className="app-cta flex w-full justify-center py-2.5 text-sm">
              Sign in to like &amp; comment
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
