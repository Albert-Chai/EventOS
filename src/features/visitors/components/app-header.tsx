"use client";

import { Home, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { TAB_ICONS } from "./tab-icons";
import { activeTabKey, eventBaseFromPath, type VisitorTab } from "../nav-tabs";

/**
 * The brand header of the visitor app shell, and — from `lg:` up — the primary
 * navigation. A bottom tab bar is a phone idiom: on a desktop window it puts
 * navigation as far from the content as the screen allows, so above 1024px the
 * tabs move up here and `BottomNav` hides itself. Both read the same list from
 * `nav-tabs.ts`, so they can never disagree about what's active.
 *
 * Client-side so it can derive the current event (`/{tenant}/{event}`) from the
 * path. `tabs` is empty off an event (the tenant landing page), which degrades
 * this to a plain brand bar.
 */
export function AppHeader({ appName, tabs = [] }: { appName: string; tabs?: VisitorTab[] }) {
  const pathname = usePathname();
  const base = eventBaseFromPath(pathname);
  const active = activeTabKey(pathname);
  const hasTabs = tabs.length > 0;

  const iconBtn =
    "grid size-9 place-items-center rounded-xl bg-white/20 text-[var(--brand-ink)] transition-colors hover:bg-white/30";

  return (
    <header className="app-header sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href={base ?? "/"} aria-label="Event home" className={iconBtn}>
          <Home className="size-5" aria-hidden />
        </Link>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-center text-[15px] font-bold tracking-tight",
            // Below lg the name is the centrepiece between two icon buttons; from
            // lg it steps aside and the tabs take the middle.
            hasTabs && "lg:flex-none lg:text-left",
          )}
        >
          {appName}
        </span>

        {hasTabs && base ? (
          <nav aria-label="Event sections" className="hidden min-w-0 flex-1 justify-center lg:flex">
            <ul className="flex items-center gap-1">
              {tabs.map((tab) => {
                const Icon = TAB_ICONS[tab.key];
                const isActive = active === tab.key;
                return (
                  <li key={tab.key}>
                    <Link
                      href={`${base}${tab.segment}`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                        isActive
                          ? "bg-white text-[var(--brand)] shadow-sm"
                          : "text-[var(--brand-ink)]/85 hover:bg-white/20 hover:text-[var(--brand-ink)]",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {base ? (
          <Link href={`${base}/merchants`} aria-label="Search stalls" className={iconBtn}>
            <Search className="size-5" aria-hidden />
          </Link>
        ) : (
          <span className="size-9" aria-hidden />
        )}
      </div>
    </header>
  );
}
