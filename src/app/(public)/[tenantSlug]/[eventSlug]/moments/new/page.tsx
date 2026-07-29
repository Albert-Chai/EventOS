import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MomentComposer } from "@/features/moments/components/moment-composer";
import { brandStyle } from "@/features/visitors/theme";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { getEventSettings } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";
import { listPublicParticipations } from "@/server/db/repositories/participations.repository";
import { getSignedInVisitorForRead } from "@/server/services/visitor-account.service";
import { getCurrentUser } from "@/server/auth/session";

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export const metadata: Metadata = {
  title: "Share a moment",
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

  // Resolved for the byline preview only; posting re-resolves and links the row.
  await getSignedInVisitorForRead();

  const stalls = await listPublicParticipations(event.id);
  const branding = await getEventBranding(event.tenantId, event.id);
  const primary = branding?.primaryColor ?? "#e11d48";

  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6" style={brandStyle(primary)}>
      <div className="mb-5 grid gap-1">
        <Link
          href={`/${tenantSlug}/${eventSlug}/moments`}
          className="text-muted-foreground hover:text-foreground min-h-9 text-sm transition-colors"
        >
          ← Moments
        </Link>
        <h1 className="text-foreground text-3xl font-extrabold tracking-tight">Share a moment</h1>
      </div>

      <MomentComposer
        tenantSlug={tenantSlug}
        eventSlug={eventSlug}
        stalls={stalls.map((s) => ({ participationId: s.participationId, name: s.merchantName }))}
      />
    </article>
  );
}
