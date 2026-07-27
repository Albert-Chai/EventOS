import Link from "next/link";

import { env } from "@/config/env";
import { InstallPrompt } from "@/features/pwa/components/install-prompt";
import { ServiceWorkerRegister } from "@/features/pwa/components/service-worker-register";

/**
 * Public shell for visitor-facing pages (spec §9: mobile-first, designed at
 * 390px first). No auth, no dashboard chrome — a glassy sticky header and a slim
 * footer around the event content. These routes live outside the protected
 * prefixes, so anonymous visitors reach them (see proxy.ts). The PWA plumbing
 * (service worker + install banner, spec §8.10) lives here so it covers every
 * event.
 *
 * `.neon` scopes the Night Market Neon look (globals.css) to the whole visitor
 * tree — a committed dark, after-dark-festival aesthetic. Each event page sets
 * its own `--brand` inline, so the platform reads as one experience while every
 * organiser's colour still leads their glow.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="neon flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1a0b2e]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span
              className="size-6 rounded-lg"
              style={{
                background:
                  "conic-gradient(from 210deg,#ff2d78,#ff8a3d,#c6f24e,#39d98a,#7c3aed,#ff2d78)",
              }}
              aria-hidden
            />
            <span className="leading-none">
              {env.NEXT_PUBLIC_APP_NAME}
              <span className="mt-0.5 block text-[11px] font-medium tracking-wide text-white/45">
                Live event guide
              </span>
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-white/10 px-4 py-8 text-center sm:px-6">
        <p className="text-xs text-white/45">
          Powered by <span className="font-semibold text-white/70">{env.NEXT_PUBLIC_APP_NAME}</span>
        </p>
      </footer>
      <ServiceWorkerRegister />
      <InstallPrompt />
    </div>
  );
}
