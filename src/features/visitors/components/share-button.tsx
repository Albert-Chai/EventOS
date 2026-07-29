"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trackEventAction } from "@/features/analytics/actions";
import { cn } from "@/lib/utils";

/**
 * Share the current page (spec §8.8). Uses the Web Share sheet on mobile and
 * falls back to copying the link to the clipboard everywhere else. When `track`
 * is given, a share fires a `share_clicked` analytics beacon (spec §25).
 */
export function ShareButton({
  title,
  text,
  className,
  track,
}: {
  title: string;
  text?: string;
  className?: string;
  track?: { tenantSlug: string; eventSlug: string; merchantSlug?: string };
}) {
  const [busy, setBusy] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied");
  }

  async function share() {
    setBusy(true);
    if (track) {
      void trackEventAction({ name: "share_clicked", ...track });
    }
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url: window.location.href });
      } else {
        await copyLink();
      }
    } catch (error) {
      // The user dismissing the native share sheet throws AbortError — ignore it.
      if ((error as Error)?.name !== "AbortError") {
        try {
          await copyLink();
        } catch {
          toast.error("Couldn’t share this page.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className={cn(
        "border-border bg-card text-foreground hover:bg-secondary inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60",
        className,
      )}
    >
      <Share2 className="size-4" aria-hidden />
      Share
    </button>
  );
}
