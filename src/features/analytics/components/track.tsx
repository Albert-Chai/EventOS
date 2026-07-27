"use client";

import { useEffect, useRef } from "react";

import type { ClientTrackableEvent } from "@/server/analytics/taxonomy";
import { trackEventAction } from "../actions";

/**
 * Fires a single analytics beacon when the page mounts (spec §25) — the Phase 5
 * `RecordView` pattern generalized. A client effect, because the beacon may set
 * the anonymous-id cookie, which a Server Component render cannot do. Needs JS, so
 * bots and prefetches are excluded. Renders nothing.
 *
 * The tenant + event are resolved from the slugs on the server, never trusted
 * from these props (the §6 public seam) — the props only address the target.
 */
export function Track({
  name,
  tenantSlug,
  eventSlug,
  merchantSlug,
  props,
}: {
  name: ClientTrackableEvent;
  tenantSlug: string;
  eventSlug: string;
  merchantSlug?: string;
  props?: Record<string, string | number | boolean>;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void trackEventAction({ name, tenantSlug, eventSlug, merchantSlug, props });
    // Intentionally fire once per mount; props are a stable snapshot of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
