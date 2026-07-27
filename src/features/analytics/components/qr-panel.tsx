"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { getEventQrAction, getMerchantQrAction } from "../actions";
import type { QrPanelResult } from "../state";

type QrPanelProps =
  | { kind: "event"; eventId: string }
  | { kind: "merchant"; merchantId: string; participationId: string };

/**
 * Renders a target's trackable QR code. The image is generated on the server and
 * returned as a self-contained data URI, so nothing is fetched from an external
 * host. Loads on mount (the code is created lazily + idempotently) and shows
 * loading / error / ready states (spec §33.2 rule 9).
 */
export function QrPanel(props: QrPanelProps) {
  const [state, setState] = useState<"loading" | QrPanelResult>("loading");
  const [copied, setCopied] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const load =
      props.kind === "event"
        ? getEventQrAction({ eventId: props.eventId })
        : getMerchantQrAction({
            merchantId: props.merchantId,
            participationId: props.participationId,
          });
    void load.then(setState).catch(() => setState({ ok: false, message: "Could not load the QR code." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") {
    return <p className="text-muted-foreground text-sm">Generating QR code…</p>;
  }
  if (!state.ok) {
    return <p className="text-destructive text-sm">{state.message}</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Image
        src={state.dataUri}
        alt="QR code linking to the public page"
        width={140}
        height={140}
        unoptimized
        className="rounded-md border bg-white p-1"
      />
      <div className="grid gap-1 text-sm">
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-4"
        >
          {state.url.replace(/^https?:\/\//, "")}
        </a>
        <p className="text-muted-foreground">
          {state.scanCount} {state.scanCount === 1 ? "scan" : "scans"}
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(state.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard unavailable (insecure context) — the link is still visible.
            }
          }}
          className="hover:bg-muted/50 w-fit rounded-md border px-2 py-1 text-xs font-medium transition-colors"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
