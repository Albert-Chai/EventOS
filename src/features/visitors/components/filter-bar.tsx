"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { DirectoryFacets } from "@/server/services/directory.service";

/**
 * Directory filters (spec §8.9): category chips, a zone picker, and the halal /
 * promo toggles. Every choice is written to the URL, so the whole filter state is
 * shareable and survives a reload — the server search reads it back.
 */

const SELECT_CLASS =
  "border-border bg-card text-foreground h-9 rounded-full border px-3 text-sm shadow-sm outline-none focus:border-[var(--brand)]";

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
  const hasFilters = Boolean(
    categoryId || zoneId || halal || promo || params.get("q"),
  );

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3.5 py-1.5 text-sm font-semibold shadow-sm transition-colors",
      active
        ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]"
        : "border-border bg-card text-foreground hover:bg-secondary",
    );

  return (
    <div className="grid gap-2">
      {facets.categories.length > 0 ? (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
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
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
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
            className={SELECT_CLASS}
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
            className="text-muted-foreground text-sm underline underline-offset-4"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}
