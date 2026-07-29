"use client";

import { useEffect, useRef } from "react";

import { recordAdImpressionAction } from "../actions";

/**
 * Fires one impression beacon when an ad becomes visible.
 *
 * Uses IntersectionObserver rather than mount, so an ad far below the fold isn't
 * counted as seen — a "viewable impression", which is the number a sponsor
 * actually cares about. Falls back to counting on mount where the API is absent.
 * Renders nothing.
 */
export function AdImpression({ bookingId }: { bookingId: string }) {
  const fired = useRef(false);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fire = () => {
      if (fired.current) return;
      fired.current = true;
      void recordAdImpressionAction(bookingId);
    };

    const node = anchor.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [bookingId]);

  return <span ref={anchor} aria-hidden className="block h-0 w-0" />;
}
