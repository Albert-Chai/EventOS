"use client";

import { Home, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The brand header of the visitor app shell. Client-side so it can derive the
 * current event (`/{tenant}/{event}`) from the path — the shared layout doesn't
 * know the route params. Home returns to the event; the search glass jumps to
 * the stall directory. Off an event route it degrades to just the app name.
 */
export function AppHeader({ appName }: { appName: string }) {
  const pathname = usePathname();
  const seg = pathname.split("/").filter(Boolean);
  const onEvent = seg.length >= 2;
  const base = onEvent ? `/${seg[0]}/${seg[1]}` : "/";
  const iconBtn =
    "grid size-9 place-items-center rounded-xl bg-white/20 text-[var(--brand-ink)] transition-colors hover:bg-white/30";

  return (
    <header className="app-header sticky top-0 z-40">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href={base} aria-label="Event home" className={iconBtn}>
          <Home className="size-5" aria-hidden />
        </Link>
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-bold tracking-tight">
          {appName}
        </span>
        {onEvent ? (
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
