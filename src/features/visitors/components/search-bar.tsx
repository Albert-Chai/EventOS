"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The directory search box (spec §8.9). Writes the query to the `q` search param,
 * debounced, so the page re-runs the server-side full-text search. Enter submits
 * immediately. Other filters live in the URL too, so they survive a search.
 */
export function SearchBar({
  placeholder = "Search merchants, food, booths…",
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  function commit(q: string) {
    const next = new URLSearchParams(searchParams.toString());
    const trimmed = q.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounce live typing; skip the first render so we don't rewrite the URL on load.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => commit(value), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit reads the latest params via closure; re-run only on value change.
  }, [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        commit(value);
      }}
      className="relative"
    >
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden
      />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search merchants"
        className="border-input h-11 w-full rounded-lg border bg-transparent pr-3 pl-9 text-sm outline-none"
      />
    </form>
  );
}
