import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { X } from "lucide-react";

import { MomentComposer } from "@/features/moments/components/moment-composer";
import { brandStyle } from "@/features/visitors/theme";
import { getEventBranding, getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicParticipations } from "@/server/db/repositories/participations.repository";
import { getCurrentUser } from "@/server/auth/session";
import { getVisitorReader } from "@/server/services/visitor-account.service";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export const metadata: Metadata = {
  title: "New moment",
  robots: { index: false, follow: false },
};

/**
 * The compose screen — the one Moments surface that requires an account.
 *
 * Sign-in reuses the existing audited auth flow with `?next=` pointing back
 * here; `safeRedirectPath` already governs that parameter, so there is no new
 * open-redirect surface to guard.
 */
export default async function NewMomentPage({ params }: Params) {
  const { tenantSlug, eventSlug } = await params;

  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) notFound();

  const settings = await getEventSettings(event.tenantId, event.id);
  if (!settings?.enableMoments) notFound();

  const here = `/${tenantSlug}/${eventSlug}/moments/new`;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(here)}`);

  // For the byline preview only; posting re-resolves and links the visitor row.
  const viewer = await getVisitorReader();
  const authorName = viewer?.displayName ?? user.email.split("@")[0] ?? "You";

  const stalls = await listPublicParticipations(event.id);
  const branding = await getEventBranding(event.tenantId, event.id);
  const primary = branding?.primaryColor ?? "#e11d48";

  return (
    <div className="moments min-h-dvh" style={brandStyle(primary)}>
      <div className="mx-auto w-full max-w-[470px]">
        <div className="sticky top-[57px] z-30 flex items-center gap-1 border-b border-[var(--feed-line)] bg-white/95 px-2 py-2 backdrop-blur">
          <Link
            href={`/${tenantSlug}/${eventSlug}/moments`}
            aria-label="Cancel"
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
          >
            <X aria-hidden className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">New moment</h1>
          <span aria-hidden className="size-9 shrink-0" />
        </div>

        <MomentComposer
          tenantSlug={tenantSlug}
          eventSlug={eventSlug}
          authorName={authorName}
          stalls={stalls.map((s) => ({
            participationId: s.participationId,
            name: s.merchantName,
          }))}
        />
      </div>
    </div>
  );
}
