import { InstallPrompt } from "@/features/pwa/components/install-prompt";
import { ServiceWorkerRegister } from "@/features/pwa/components/service-worker-register";

/**
 * Public shell for visitor-facing pages (spec §9: mobile-first, designed at
 * 390px first, then given real desktop layouts from `lg:` up — see
 * `docs/desktop-layouts-plan.md`). A light "festival app" shell around light
 * cards, themed per event by `--brand` (set inline on each page). No auth, no
 * dashboard chrome; these routes live outside the protected prefixes so
 * anonymous visitors reach them (see proxy.ts). The PWA plumbing (service worker
 * + install banner, spec §8.10) lives here so it covers every event.
 *
 * `.appshell` scopes the light theme (globals.css) to the whole visitor tree so
 * the dashboard/admin keep the default surfaces.
 *
 * **The nav lives one level down, not here.** From `lg:` up the header carries
 * the event's tabs, and which tabs exist depends on which features the event has
 * switched on — something only the `[eventSlug]` layout knows. Context can't
 * bridge that (the header would be a sibling *above* `children`, not inside it),
 * so the header is rendered by the two segments that do the event lookup: the
 * `[eventSlug]` layout, and the tenant landing page.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell flex min-h-dvh flex-col">
      {children}
      <ServiceWorkerRegister />
      <InstallPrompt />
    </div>
  );
}
