import { env } from "@/config/env";
import { AppHeader } from "@/features/visitors/components/app-header";
import { InstallPrompt } from "@/features/pwa/components/install-prompt";
import { ServiceWorkerRegister } from "@/features/pwa/components/service-worker-register";

/**
 * Public shell for visitor-facing pages (spec §9: mobile-first, designed at
 * 390px first). A light "festival app" shell — a brand header and a bottom tab
 * bar around light cards — themed per event by `--brand` (set inline on each
 * page). No auth, no dashboard chrome; these routes live outside the protected
 * prefixes so anonymous visitors reach them (see proxy.ts). The PWA plumbing
 * (service worker + install banner, spec §8.10) lives here so it covers every
 * event.
 *
 * `.appshell` scopes the light theme (globals.css) to the whole visitor tree so
 * the dashboard/admin keep the default surfaces.
 *
 * The bottom tab bar lives one level down, in the `[eventSlug]` layout: which
 * tabs exist depends on which features the event has switched on, and only that
 * layout knows the event.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell flex min-h-dvh flex-col">
      <AppHeader appName={env.NEXT_PUBLIC_APP_NAME} />
      <main className="flex-1 pb-24">{children}</main>
      <ServiceWorkerRegister />
      <InstallPrompt />
    </div>
  );
}
