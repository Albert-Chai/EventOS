"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { toggleFavouriteAction } from "../actions";

/**
 * The save/unsave heart (spec §8.8). Optimistic: the UI flips instantly and only
 * reverts if the server rejects. The visitor identity is a cookie the action
 * mints server-side, so this works for anonymous browsers with no sign-in.
 */
export function FavouriteButton({
  tenantSlug,
  eventSlug,
  merchantSlug,
  initialFavourited,
  variant = "icon",
  className,
}: {
  tenantSlug: string;
  eventSlug: string;
  merchantSlug: string;
  initialFavourited: boolean;
  /** "icon" for a compact heart on cards; "button" for a labelled control. */
  variant?: "icon" | "button";
  className?: string;
}) {
  const [favourited, setFavourited] = useState(initialFavourited);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !favourited;
    setFavourited(next); // optimistic
    startTransition(async () => {
      const result = await toggleFavouriteAction({
        tenantSlug,
        eventSlug,
        merchantSlug,
        favourite: next,
      });
      if (!result.ok) {
        setFavourited(!next); // revert
        toast.error(result.message);
      } else if (result.favourited !== next) {
        setFavourited(result.favourited);
      }
    });
  }

  const label = favourited ? "Remove from favourites" : "Save to favourites";

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favourited}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60",
          favourited
            ? "border-rose-200 bg-rose-50 text-rose-600"
            : "border-border bg-card text-foreground hover:bg-secondary",
          className,
        )}
      >
        <Heart className={cn("size-4", favourited && "fill-current")} aria-hidden />
        {favourited ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favourited}
      aria-label={label}
      title={label}
      disabled={pending}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-colors disabled:opacity-60",
        favourited
          ? "border-rose-200 bg-white text-rose-600"
          : "border-border text-muted-foreground hover:text-foreground bg-white/90",
        className,
      )}
    >
      <Heart className={cn("size-4", favourited && "fill-current")} aria-hidden />
    </button>
  );
}
