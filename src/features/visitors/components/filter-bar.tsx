"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { DirectoryFacets } from "@/server/services/directory.service";

/**
 * Directory filters (spec §8.9): category chips, a zone picker, and the halal /
 * promo toggles. Every choice is written to the URL, so the whole filter state is
 * shareable and survives a reload — the server search reads it back.
 *
 * One DOM, two shapes. On a phone the categories are a horizontally scrolling
 * chip rail; from `lg` the same buttons stack into a labelled sidebar column,
 * where 21 categories read as a list instead of wrapping across four rows.
 * Responsive classes rather than two renderings, because duplicating the markup
 * would duplicate the URL-writing handlers with it.
 */

export function FilterBar({ facets }: { facets: DirectoryFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function patch(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val) next.set(key, val);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const categoryId = params.get("category");
  const zoneId = params.get("zone") ?? "";
  const halal = params.get("halal") === "1";
  const promo = params.get("promo") === "1";
  const hasFilters = Boolean(categoryId || zoneId || halal || promo || params.get("q"));

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-sm transition-colors",
      // Sidebar shape: full-width, left-aligned, square-ish — a list, not a pill rail.
      "lg:w-full lg:rounded-lg lg:px-3 lg:py-2 lg:text-left lg:shadow-none",
      active
        ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]"
        : "border-border bg-card text-foreground hover:bg-secondary",
    );

  return (
    <div className="grid gap-2 lg:gap-5">
      {facets.categories.length > 0 ? (
        <div className="grid gap-1.5">
          <h2 className="app-eyebrow hidden lg:block">Category</h2>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 lg:mx-0 lg:flex-col lg:flex-nowrap lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
            {facets.categories.map((c) => {
              const active = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patch({ category: active ? null : c.id })}
                  className={cn(chip(active), "shrink-0")}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <h2 className="app-eyebrow hidden lg:block">Filter</h2>
        <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
          <button
            type="button"
            aria-pressed={halal}
            onClick={() => patch({ halal: halal ? null : "1" })}
            className={chip(halal)}
          >
            Halal
          </button>
          <button
            type="button"
            aria-pressed={promo}
            onClick={() => patch({ promo: promo ? null : "1" })}
            className={chip(promo)}
          >
            Promo
          </button>
          {facets.zones.length > 0 ? (
            <select
              value={zoneId}
              aria-label="Zone"
              onChange={(e) => patch({ zone: e.target.value || null })}
              className="border-border bg-card text-foreground h-9 rounded-full border px-3 text-sm shadow-sm outline-none focus:border-[var(--brand)] lg:h-10 lg:w-full lg:rounded-lg lg:shadow-none"
            >
              <option value="">All zones</option>
              {facets.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          ) : null}
          {hasFilters ? (
            <button
              type="button"
              onClick={() => router.replace(pathname, { scroll: false })}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 lg:mt-1 lg:text-left"
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
