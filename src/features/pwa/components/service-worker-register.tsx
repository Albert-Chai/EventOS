"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on public pages (spec §8.10). Registration is
 * production-only so it never interferes with the dev server's hot reload. The
 * SW is served from the root so its scope covers every event under the origin.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort; the site works without it.
      });
    };

    // Wait for load so the SW install doesn't compete with first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
