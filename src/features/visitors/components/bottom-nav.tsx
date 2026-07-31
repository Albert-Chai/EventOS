"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { TAB_ICONS } from "./tab-icons";
import { activeTabKey, eventBaseFromPath, type VisitorTab } from "../nav-tabs";

/**
 * The visitor app-shell bottom tab bar — the phone navigation. Hidden from `lg:`
 * up, where `AppHeader` renders the same tabs inline instead.
 *
 * Which tabs exist is decided by the `[eventSlug]` layout from the event's
 * settings; a tab that would land on a 404 is never rendered, and dropping the
 * unused ones is what keeps six candidates fitting at 390px.
 */
export function BottomNav({ tabs }: { tabs: VisitorTab[] }) {
  const pathname = usePathname();
  const base = eventBaseFromPath(pathname);
  const active = activeTabKey(pathname);
  if (base === null || tabs.length === 0) return null;

  return (
    <nav
      aria-label="Event sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.key];
          const isActive = active === tab.key;
          return (
            <Link
              key={tab.key}
              href={`${base}${tab.segment}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                // min-w-0 so a six-tab bar shrinks instead of widening the page
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2 text-[10px] font-semibold transition-colors",
                isActive
                  ? "text-[var(--brand)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-ink)]",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="w-full truncate text-center">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
