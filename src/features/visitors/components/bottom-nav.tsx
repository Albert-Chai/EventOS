"use client";

import { Heart, Home, Map as MapIcon, Store, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The visitor app-shell bottom tab bar. Client-side so it can derive the event
 * base (`/{tenant}/{event}`) from the path and highlight the active tab. Renders
 * nothing off an event route (e.g. the tenant index), where there's no event to
 * navigate within.
 */
export function BottomNav() {
  const pathname = usePathname();
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length < 2) return null;

  const base = `/${seg[0]}/${seg[1]}`;
  const rest = pathname.slice(base.length); // "", "/merchants", "/map", …
  const third = seg[2];

  const tabs = [
    { href: base, label: "Home", icon: Home, active: rest === "" },
    {
      href: `${base}/merchants`,
      label: "Stalls",
      icon: Store,
      // the directory, plus a merchant detail page (/{tenant}/{event}/{slug})
      active:
        rest.startsWith("/merchants") ||
        (seg.length === 3 && !["map", "vouchers", "favourites"].includes(third)),
    },
    { href: `${base}/map`, label: "Floor plan", icon: MapIcon, active: rest.startsWith("/map") },
    {
      href: `${base}/vouchers`,
      label: "Vouchers",
      icon: Ticket,
      active: rest.startsWith("/vouchers"),
    },
    {
      href: `${base}/favourites`,
      label: "Saved",
      icon: Heart,
      active: rest.startsWith("/favourites"),
    },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-stretch">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors",
                t.active
                  ? "text-[var(--brand)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-ink)]",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
