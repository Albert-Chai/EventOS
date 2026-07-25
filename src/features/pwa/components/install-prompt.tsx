"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The "Add to home screen" banner (spec §8.10). Chromium fires
 * `beforeinstallprompt`; we stash it and show a dismissible bar so the visitor
 * installs the event as an app on their own terms. A dismissal is remembered so
 * we don't nag. iOS has no such event — Safari installs via the Share menu — so
 * the banner simply never appears there, which is fine.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "eventos_pwa_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;

  async function install() {
    const event = deferred;
    if (!event) return;
    setDeferred(null);
    await event.prompt();
    await event.userChoice;
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDeferred(null);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3">
      <div className="bg-background mx-auto flex max-w-2xl items-center gap-3 rounded-xl border p-3 shadow-lg">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">Install this event</span> for quick access, offline
          browsing, and your favourites.
        </p>
        <button
          type="button"
          onClick={install}
          className="bg-foreground text-background shrink-0 rounded-lg px-3 py-2 text-sm font-medium"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
