import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { BrandingForm } from "@/features/events/components/branding-form";
import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findEventById } from "@/server/db/repositories/events.repository";
import { listFilesByIds } from "@/server/db/repositories/files.repository";
import { requirePermissionOrRedirect } from "@/server/policies/require-user";
import { publicFileUrl } from "@/server/services/media.service";

export const metadata: Metadata = {
  title: "Event branding",
  robots: { index: false, follow: false },
};

export default async function EventBrandingPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ctx = await requirePermissionOrRedirect(
    "event.update",
    `/dashboard/events/${eventId}/branding`,
  );

  const event = await findEventById(ctx.tenant.id, eventId);
  if (!event) notFound();
  const branding = await getEventBranding(ctx.tenant.id, eventId);
  if (!branding) notFound();

  const mediaIds = [branding.logoFileId, branding.coverFileId].filter((id): id is string =>
    Boolean(id),
  );
  const media = mediaIds.length ? await listFilesByIds(ctx.tenant.id, mediaIds) : [];
  const urlFor = (id: string | null) => {
    const file = id ? media.find((f) => f.id === id) : null;
    return file ? publicFileUrl(file) : null;
  };

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`/dashboard/events/${eventId}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="text-muted-foreground text-sm">
          The theme, colours, logo, and cover applied to this event&apos;s public page.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <BrandingForm
            eventId={eventId}
            branding={branding}
            logoUrl={urlFor(branding.logoFileId)}
            coverUrl={urlFor(branding.coverFileId)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
