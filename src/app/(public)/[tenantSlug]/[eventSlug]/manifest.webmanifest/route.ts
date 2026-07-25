import { getEventBranding } from "@/server/db/repositories/event-config.repository";
import { findPublicEvent } from "@/server/db/repositories/events.repository";

/**
 * A per-event Web App Manifest (spec §8.10, PWA). Each published event installs
 * as its own app: the name, scope, and theme come from the event, so a visitor's
 * home screen holds "Taste of KL", not a generic shell.
 *
 * Public seam (§6): resolved from the URL slugs via `findPublicEvent`, which
 * returns null for any non-public event — a draft's manifest is a 404, exactly
 * like its page.
 */

type Params = { params: Promise<{ tenantSlug: string; eventSlug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { tenantSlug, eventSlug } = await params;
  const event = await findPublicEvent(tenantSlug, eventSlug);
  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const branding = await getEventBranding(event.tenantId, event.id);
  const theme = branding?.primaryColor ?? "#0f172a";
  const scope = `/${event.tenantSlug}/${event.slug}`;

  const manifest = {
    id: scope,
    name: event.name,
    short_name: event.name.length > 24 ? event.name.slice(0, 24) : event.name,
    description: event.shortDescription ?? undefined,
    start_url: scope,
    scope,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: theme,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      // Short cache: branding/name can change, but the manifest is tiny.
      "cache-control": "public, max-age=300, must-revalidate",
    },
  });
}
