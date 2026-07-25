import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * The offline fallback the service worker serves when a navigation fails with no
 * network (spec §8.10). Deliberately static and data-free so it can be precached
 * and shown without a server round-trip.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-4xl" aria-hidden>
        📡
      </p>
      <h1 className="text-xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page isn&apos;t available without a connection. Pages you&apos;ve already opened may
        still work — reconnect to see the latest.
      </p>
    </main>
  );
}
