"use client";

import { useEffect, useRef } from "react";

import { recordViewAction } from "../actions";

/**
 * Fires a single "viewed" write for the merchant when its page mounts. It has to
 * be a client effect: the action sets the visitor cookie, which a Server
 * Component render cannot do. Rendered with `display:none` — purely a side effect.
 */
export function RecordView({
  tenantSlug,
  eventSlug,
  merchantSlug,
}: {
  tenantSlug: string;
  eventSlug: string;
  merchantSlug: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void recordViewAction({ tenantSlug, eventSlug, merchantSlug });
  }, [tenantSlug, eventSlug, merchantSlug]);

  return null;
}
