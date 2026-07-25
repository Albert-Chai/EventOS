import Link from "next/link";

import { env } from "@/config/env";
import { InstallPrompt } from "@/features/pwa/components/install-prompt";
import { ServiceWorkerRegister } from "@/features/pwa/components/service-worker-register";

/**
 * Public shell for visitor-facing pages (spec §9: mobile-first, designed at
 * 390px first). No auth, no dashboard chrome — just a slim header and footer
 * around the event content. These routes live outside the protected prefixes,
 * so anonymous visitors reach them (see proxy.ts). The PWA plumbing (service
 * worker + install banner, spec §8.10) lives here so it covers every event.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          {env.NEXT_PUBLIC_APP_NAME}
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs sm:px-6">
        Powered by {env.NEXT_PUBLIC_APP_NAME}
      </footer>
      <ServiceWorkerRegister />
      <InstallPrompt />
    </div>
  );
}
