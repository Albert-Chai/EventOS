"use client";

import { Camera, Heart, Home, Map as MapIcon, Store, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The visitor app-shell bottom tab bar. Client-side so it can derive the event
 * base (`/{tenant}/{event}`) from the path and highlight the active tab.
 *
 * Which tabs exist is decided by the `[eventSlug]` layout from the event's
 * settings — a tab that would land on a 404 is never rendered, and dropping the
 * unused ones is what keeps six candidates fitting at 390px.
 */
export function BottomNav({
  showMap = true,
  showVouchers = false,
  showMoments = false,
  showFavourites = true,
}: {
  showMap?: boolean;
  showVouchers?: boolean;
  showMoments?: boolean;
  showFavourites?: boolean;
}) {
  const pathname = usePathname();
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length < 2) return null;

  const base = `/${seg[0]}/${seg[1]}`;
  const rest = pathname.slice(base.length); // "", "/merchants", "/map", …
  const third = seg[2];

  const reserved = ["map", "vouchers", "favourites", "moments", "merchants"];

  const tabs = [
    { key: "home", href: base, label: "Home", icon: Home, active: rest === "", show: true },
    {
      key: "stalls",
      href: `${base}/merchants`,
      label: "Stalls",
      icon: Store,
      // the directory, plus a merchant detail page (/{tenant}/{event}/{slug})
      active: rest.startsWith("/merchants") || (seg.length === 3 && !reserved.includes(third)),
      show: true,
    },
    {
      key: "map",
      href: `${base}/map`,
      label: "Floor plan",
      icon: MapIcon,
      active: rest.startsWith("/map"),
      show: showMap,
    },
    {
      key: "moments",
      href: `${base}/moments`,
      label: "Moments",
      icon: Camera,
      active: rest.startsWith("/moments"),
      show: showMoments,
    },
    {
      key: "vouchers",
      href: `${base}/vouchers`,
      label: "Vouchers",
      icon: Ticket,
      active: rest.startsWith("/vouchers"),
      show: showVouchers,
    },
    {
      key: "saved",
      href: `${base}/favourites`,
      label: "Saved",
      icon: Heart,
      active: rest.startsWith("/favourites"),
      show: showFavourites,
    },
  ].filter((t) => t.show);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-stretch">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                // min-w-0 so a six-tab bar shrinks instead of widening the page
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2 text-[10px] font-semibold transition-colors",
                t.active
                  ? "text-[var(--brand)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-ink)]",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="w-full truncate text-center">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
