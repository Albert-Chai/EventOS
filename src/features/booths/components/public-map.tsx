"use client";

import { Expand, Maximize2, Minus, Plus, RotateCw, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { BOOTH_STATUS_COLORS, type BoothStatus } from "@/server/booths/status";

/**
 * The public interactive floor plan (spec §8.6) as a festival app screen: a
 * light venue map filling the viewport, a floating control stack, and a bottom
 * sheet that carries search, the selected stall, and the visitor's food plan.
 *
 * - Drag to pan, wheel/pinch to zoom, buttons to zoom / fit / reset.
 * - Stalls are numbered tiles coloured by zone; tap one to open its details.
 * - Food Plan: add stalls as stops, pick an entrance, and the plan orders itself
 *   into a walking route (nearest-neighbour) drawn over the map. Step through it
 *   stop-by-stop, and share it (WhatsApp / Facebook / copy). The plan is encoded
 *   in the URL, so a shared link reopens the same route and a reload keeps it.
 *
 * Booth coordinates are normalized (centre), so everything lands correctly at
 * any size — mobile included.
 */

export type PublicMapFloor = {
  id: string;
  name: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type PublicMapBooth = {
  id: string;
  boothNumber: string;
  name: string | null;
  zoneId: string | null;
  mapFloorId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: BoothStatus;
  merchantSlug: string | null;
  merchantName: string | null;
  listingTitle: string | null;
};

export type PublicMapZone = { id: string; name: string; color: string | null };

type Point = { x: number; y: number };
type Entrance = { id: string; label: string; short: string; x: number; y: number };

// Four schematic gates on the edges — no venue geometry, so routes between them
// and the stalls are approximate straight lines.
// Inset from the very edge so the centred pill label isn't clipped at phone width.
const ENTRANCES: readonly Entrance[] = [
  { id: "north", label: "North Gate", short: "N", x: 0.5, y: 0.05 },
  { id: "east", label: "East Gate", short: "E", x: 0.86, y: 0.5 },
  { id: "south", label: "South Gate", short: "S", x: 0.5, y: 0.83 },
  { id: "west", label: "West Gate", short: "W", x: 0.14, y: 0.5 },
];

// Zone palette tuned for the light venue ground, used when a zone has no colour
// of its own. Assigned by zone order so map and legend always agree.
const ZONE_PALETTE = [
  "#c084fc",
  "#f59e0b",
  "#34d399",
  "#60a5fa",
  "#fb7185",
  "#a3e635",
  "#22d3ee",
  "#f472b6",
];

const MIN_SCALE = 0.6;
const MAX_SCALE = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function PublicMap({
  baseHref,
  eventName,
  venueName,
  floors,
  booths,
  zones,
  initialBooth,
}: {
  baseHref: string;
  eventName: string;
  venueName?: string | null;
  floors: PublicMapFloor[];
  booths: PublicMapBooth[];
  zones: PublicMapZone[];
  initialBooth?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const zoneColorById = useMemo(() => {
    const map = new Map<string, string>();
    zones.forEach((z, i) => map.set(z.id, z.color ?? ZONE_PALETTE[i % ZONE_PALETTE.length]));
    return map;
  }, [zones]);
  const boothByNumber = useMemo(
    () => new Map(booths.map((b) => [b.boothNumber.toLowerCase(), b])),
    [booths],
  );

  const initial = useMemo(
    () =>
      initialBooth
        ? booths.find((b) => b.boothNumber.toLowerCase() === initialBooth.toLowerCase())
        : undefined,
    [booths, initialBooth],
  );

  const [activeFloorId, setActiveFloorId] = useState<string>(
    initial?.mapFloorId ?? floors[0]?.id ?? "__none__",
  );
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  // Collapsed by default so the map — the reason you're here — leads on a phone.
  // Selecting a stall opens it; the peek row keeps it discoverable meanwhile.
  const [sheetOpen, setSheetOpen] = useState(false);

  // Food Plan — an ordered list of booth numbers, an optional entrance, and the
  // current step when walking the route. Seeded from the URL so a shared link
  // (?plan=A1,C3&from=north) or a reload reopens the same route; reading it in
  // the initializer keeps SSR and the first client render identical.
  const [plan, setPlan] = useState<string[]>(() => {
    const p = searchParams.get("plan");
    return p ? p.split(",").map((s) => s.trim()).filter(Boolean) : [];
  });
  const [entranceId, setEntranceId] = useState<string | null>(() => searchParams.get("from"));
  const [step, setStep] = useState<number | null>(null);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  // Mirror the plan into the URL (replaceState — no navigation) so it's
  // shareable and survives a reload. Skips the first run.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const qs = new URLSearchParams(searchParams.toString());
    if (plan.length) qs.set("plan", plan.join(","));
    else qs.delete("plan");
    if (entranceId) qs.set("from", entranceId);
    else qs.delete("from");
    const q = qs.toString();
    window.history.replaceState(null, "", q ? `${pathname}?${q}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, entranceId]);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;

  const floorBooths = useMemo(
    () =>
      booths.filter((b) =>
        activeFloorId === "__none__" ? !b.mapFloorId : b.mapFloorId === activeFloorId,
      ),
    [booths, activeFloorId],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const matchesSearch = useCallback(
    (b: PublicMapBooth) =>
      normalizedQuery.length === 0 ||
      b.boothNumber.toLowerCase().includes(normalizedQuery) ||
      (b.merchantName?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (b.listingTitle?.toLowerCase().includes(normalizedQuery) ?? false),
    [normalizedQuery],
  );
  const isDimmed = useCallback(
    (b: PublicMapBooth) => !matchesSearch(b) || (zoneFilter !== null && b.zoneId !== zoneFilter),
    [matchesSearch, zoneFilter],
  );

  const searchResults = useMemo(
    () => (normalizedQuery.length === 0 ? [] : floorBooths.filter(matchesSearch).slice(0, 12)),
    [normalizedQuery, floorBooths, matchesSearch],
  );

  const selected = booths.find((b) => b.id === selectedId) ?? null;

  const planIndexByNumber = useMemo(() => {
    const map = new Map<string, number>();
    plan.forEach((n, i) => map.set(n.toLowerCase(), i));
    return map;
  }, [plan]);

  const planBooths = useMemo(
    () =>
      plan
        .map((n) => boothByNumber.get(n.toLowerCase()))
        .filter((b): b is PublicMapBooth => Boolean(b)),
    [plan, boothByNumber],
  );

  const entrance = ENTRANCES.find((e) => e.id === entranceId) ?? null;

  const routePoints = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    if (entrance) pts.push({ x: entrance.x, y: entrance.y });
    for (const b of planBooths) pts.push({ x: b.x, y: b.y });
    return pts;
  }, [entrance, planBooths]);

  // --- view controls ------------------------------------------------------
  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const focusPoint = useCallback((p: Point, toScale = 2.4) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp(toScale, MIN_SCALE, MAX_SCALE);
    setScale(s);
    setTx(rect.width / 2 - p.x * rect.width * s);
    setTy(rect.height * 0.4 - p.y * rect.height * s);
  }, []);

  function zoomAround(clientX: number, clientY: number, factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setScale((s) => {
      const next = clamp(s * factor, MIN_SCALE, MAX_SCALE);
      const ratio = next / s;
      setTx((t) => px - (px - t) * ratio);
      setTy((t) => py - (py - t) * ratio);
      return next;
    });
  }
  function zoomCentre(factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAround(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    zoomAround(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }
  function onPointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest("[data-booth]")) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY, tx, ty };
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!pan.current) return;
    setTx(pan.current.tx + (event.clientX - pan.current.x));
    setTy(pan.current.ty + (event.clientY - pan.current.y));
  }
  function onPointerUp() {
    pan.current = null;
  }

  // --- plan actions -------------------------------------------------------
  const inPlan = useCallback(
    (b: PublicMapBooth) => planIndexByNumber.has(b.boothNumber.toLowerCase()),
    [planIndexByNumber],
  );
  function togglePlan(b: PublicMapBooth) {
    setStep(null);
    setPlan((p) =>
      p.some((n) => n.toLowerCase() === b.boothNumber.toLowerCase())
        ? p.filter((n) => n.toLowerCase() !== b.boothNumber.toLowerCase())
        : [...p, b.boothNumber],
    );
  }
  function clearPlan() {
    setPlan([]);
    setStep(null);
  }
  function optimiseRoute() {
    const start: Point = entrance ?? planBooths[0] ?? { x: 0.5, y: 0.5 };
    const remaining = [...planBooths];
    const ordered: PublicMapBooth[] = [];
    let cur: Point = start;
    while (remaining.length) {
      let bestI = 0;
      let bestD = Infinity;
      remaining.forEach((b, i) => {
        const d = (b.x - cur.x) ** 2 + (b.y - cur.y) ** 2;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      });
      const [next] = remaining.splice(bestI, 1);
      ordered.push(next);
      cur = next;
    }
    setPlan(ordered.map((b) => b.boothNumber));
    setStep(ordered.length ? 0 : null);
    if (ordered[0]) focusPoint(ordered[0]);
  }
  const goToStep = useCallback(
    (i: number) => {
      if (i < 0 || i >= planBooths.length) return;
      setStep(i);
      setSelectedId(planBooths[i].id);
      focusPoint(planBooths[i]);
    },
    [planBooths, focusPoint],
  );

  function pickBooth(b: PublicMapBooth) {
    setSelectedId(b.id);
    setSearchOpen(false);
    setSheetOpen(true);
    focusPoint(b);
  }

  // --- share --------------------------------------------------------------
  function shareUrl() {
    const qs = new URLSearchParams();
    if (entranceId) qs.set("from", entranceId);
    if (plan.length) qs.set("plan", plan.join(","));
    return `${window.location.origin}${pathname}?${qs.toString()}`;
  }
  function shareText() {
    const stops = planBooths
      .map((b, i) => `${i + 1}. ${b.merchantName ?? b.name ?? "Stall"} (${b.boothNumber})`)
      .join("\n");
    return `My food route at ${eventName}${entrance ? ` from ${entrance.label}` : ""}:\n${stops}`;
  }
  async function shareNative() {
    const url = shareUrl();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Food route · ${eventName}`, text: shareText(), url });
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText()}\n${url}`);
    } catch {
      // no-op
    }
  }

  // Smaller on a phone so the stack doesn't cover the stalls it sits over.
  const ctrlBtn =
    "grid size-9 sm:size-11 place-items-center rounded-xl sm:rounded-2xl bg-white/95 text-[var(--app-ink)] shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-[var(--secondary)]";

  return (
    <div className="relative">
      {/* ======================================================== THE MAP */}
      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        /* Fills the gap between the sticky header and the collapsed sheet
           (header 3.25rem + bottom nav 3.5rem + sheet peek 4rem) so the map is
           never buried under the sheet on a phone. */
        className="relative h-[calc(100dvh-10.75rem)] max-h-[46rem] min-h-[19rem] w-full touch-none overflow-hidden bg-[#e8ece4] select-none"
      >
        <div
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}
          className="absolute inset-0"
        >
          {activeFloor?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- floor plan from Storage; overlay needs raw sizing
            <img
              src={activeFloor.imageUrl}
              alt={`${activeFloor.name} floor plan`}
              className="pointer-events-none absolute inset-0 size-full object-contain"
              draggable={false}
            />
          ) : (
            // schematic venue ground: soft blocks + a grid, like a printed plan
            <div className="absolute inset-0" aria-hidden>
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:5%_7.5%]" />
              <div className="absolute inset-[8%] rounded-[2rem] bg-white/45" />
              <div className="absolute top-[34%] left-[30%] h-[30%] w-[40%] rounded-2xl bg-black/[0.045]" />
              <span className="absolute top-[46%] left-1/2 -translate-x-1/2 text-center text-[2.2cqw] font-extrabold tracking-[0.12em] text-black/25 uppercase">
                {venueName ?? eventName}
              </span>
            </div>
          )}

          {/* route line: entrance → stops */}
          {routePoints.length > 1 ? (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full"
              aria-hidden
            >
              <polyline
                points={routePoints.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="none"
                stroke="var(--brand)"
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
                opacity={0.85}
              />
            </svg>
          ) : null}

          {/* entrances */}
          {ENTRANCES.map((e) => {
            const active = e.id === entranceId;
            return (
              <button
                key={e.id}
                type="button"
                data-booth
                onClick={() => setEntranceId((cur) => (cur === e.id ? null : e.id))}
                style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2.5 py-2 text-[10px] font-bold whitespace-nowrap shadow-sm backdrop-blur transition-colors",
                  active
                    ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]"
                    : "border-black/10 bg-white/95 text-[var(--app-ink)] hover:bg-white",
                )}
              >
                <span
                  style={{ transform: `scale(${1 / Math.max(1, scale)})` }}
                  className="inline-block"
                >
                  ▟ {e.label}
                </span>
              </button>
            );
          })}

          {/* stalls */}
          {floorBooths.map((booth) => {
            const color = booth.zoneId
              ? (zoneColorById.get(booth.zoneId) ?? BOOTH_STATUS_COLORS[booth.status])
              : BOOTH_STATUS_COLORS[booth.status];
            const dimmed = isDimmed(booth);
            const isSelected = booth.id === selectedId;
            const planIdx = planIndexByNumber.get(booth.boothNumber.toLowerCase());
            const isStep = step !== null && planBooths[step]?.id === booth.id;
            return (
              <button
                key={booth.id}
                type="button"
                data-booth
                onClick={() => pickBooth(booth)}
                style={{
                  left: `${(booth.x - booth.width / 2) * 100}%`,
                  top: `${(booth.y - booth.height / 2) * 100}%`,
                  width: `${booth.width * 100}%`,
                  height: `${booth.height * 100}%`,
                  transform: `rotate(${booth.rotation}deg)`,
                  backgroundColor: color,
                  opacity: dimmed ? 0.3 : 1,
                  boxShadow: isStep
                    ? "0 0 0 3px var(--brand)"
                    : isSelected
                      ? "0 0 0 2.5px #1b1a19"
                      : undefined,
                }}
                className="absolute flex items-center justify-center rounded-[4px] border border-black/25 text-[9px] font-bold text-black/75"
                aria-label={`Booth ${booth.boothNumber}${booth.merchantName ? `, ${booth.merchantName}` : ""}`}
              >
                <span
                  className="pointer-events-none max-w-full truncate px-0.5"
                  style={{ transform: `scale(${1 / Math.max(1, scale)})` }}
                >
                  {booth.boothNumber}
                </span>
                {planIdx !== undefined ? (
                  <span
                    className="pointer-events-none absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-[var(--brand)] text-[8px] font-extrabold text-[var(--brand-ink)] shadow"
                    style={{ transform: `scale(${1 / Math.max(1, scale)})` }}
                  >
                    {planIdx + 1}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* status chip — top left, over the map */}
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-black/5">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
          {floorBooths.length} stalls · {zones.length} zones
        </div>

        {/* floating control stack — top right */}
        <div className="absolute top-3 right-3 grid gap-2">
          {floors.length > 1 ? (
            <select
              value={activeFloorId}
              onChange={(e) => {
                setActiveFloorId(e.target.value);
                resetView();
                setSelectedId(null);
              }}
              aria-label="Floor"
              className="text-foreground h-11 rounded-2xl bg-white px-3 text-sm font-semibold shadow-md ring-1 ring-black/5 outline-none"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" aria-label="Zoom in" className={ctrlBtn} onClick={() => zoomCentre(1.35)}>
            <Plus className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Zoom out" className={ctrlBtn} onClick={() => zoomCentre(1 / 1.35)}>
            <Minus className="size-5" aria-hidden />
          </button>
          <button type="button" aria-label="Fit map" className={ctrlBtn} onClick={resetView}>
            <Maximize2 className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Reset view and filters"
            className={ctrlBtn}
            onClick={() => {
              resetView();
              setZoneFilter(null);
              setQuery("");
              setSelectedId(null);
            }}
          >
            <RotateCw className="size-5" aria-hidden />
          </button>
        </div>

        {/* zone legend / filter — one scrollable row so 8+ zones never blanket
            the map on a phone */}
        {zones.length > 0 ? (
          <div className="absolute inset-x-0 bottom-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
            {zones.map((z) => {
              const on = zoneFilter === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZoneFilter((cur) => (cur === z.id ? null : z.id))}
                  aria-pressed={on}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold shadow-sm ring-1 backdrop-blur transition-colors",
                    on
                      ? "bg-[var(--app-ink)] text-white ring-transparent"
                      : "bg-white/95 text-[var(--app-ink)] ring-black/5 hover:bg-white",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: zoneColorById.get(z.id) ?? "transparent" }}
                  />
                  {z.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* step bar while walking a route */}
        {step !== null && planBooths.length > 0 ? (
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-2xl bg-white/97 px-3 py-2 text-sm shadow-lg ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              disabled={step === 0}
              className="text-foreground rounded-full px-3 py-1 font-semibold disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-muted-foreground min-w-0 text-center text-xs">
              Stop <span className="font-bold text-[var(--brand)]">{step + 1}</span> /{" "}
              {planBooths.length}
              <span className="text-foreground block truncate font-semibold">
                {planBooths[step]?.merchantName ?? planBooths[step]?.boothNumber}
              </span>
            </span>
            {step + 1 < planBooths.length ? (
              <button
                type="button"
                onClick={() => goToStep(step + 1)}
                className="rounded-full bg-[var(--brand)] px-3 py-1 font-bold text-[var(--brand-ink)]"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(null)}
                className="bg-secondary text-foreground rounded-full px-3 py-1 font-bold"
              >
                Exit plan
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* ==================================================== BOTTOM SHEET */}
      <section
        className={cn(
          "fixed inset-x-0 bottom-14 z-30 mx-auto max-w-2xl rounded-t-3xl bg-white shadow-[0_-8px_30px_-12px_#1b1a1959] ring-1 ring-black/5 transition-transform",
          sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-4rem)]",
        )}
      >
        {/* Peek row — doubles as the collapse handle. Collapsed, it still says
            what the panel is for (and names the selected stall), so the sheet
            never reads as a blank bar. */}
        <button
          type="button"
          onClick={() => setSheetOpen((o) => !o)}
          aria-expanded={sheetOpen}
          className="flex w-full flex-col items-center gap-1 px-4 pt-2.5 pb-2"
          aria-label={sheetOpen ? "Collapse panel" : "Expand panel"}
        >
          <span className="h-1.5 w-10 shrink-0 rounded-full bg-black/15" aria-hidden />
          <span className="flex w-full items-center gap-2">
            <Search className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
            <span className="text-foreground min-w-0 flex-1 truncate text-left text-sm font-semibold">
              {selected
                ? (selected.listingTitle ?? selected.merchantName ?? `Booth ${selected.boothNumber}`)
                : "Find a stall or merchant"}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {sheetOpen ? "Hide" : plan.length ? `Plan · ${plan.length}` : "Open"}
            </span>
          </span>
        </button>

        <div className="max-h-[44dvh] overflow-y-auto px-4 pb-5">
          {searchOpen ? (
            /* ---- search mode ---- */
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search merchants or stalls"
                    aria-label="Search merchants or stalls"
                    className="border-border text-foreground placeholder:text-muted-foreground h-11 w-full rounded-full border pr-4 pl-10 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="text-muted-foreground hover:text-foreground px-2 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
              <ul className="mt-3 grid gap-1.5">
                {searchResults.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => pickBooth(b)}
                      className="border-border hover:bg-secondary flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
                    >
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-black/70"
                        style={{
                          backgroundColor: b.zoneId
                            ? (zoneColorById.get(b.zoneId) ?? "#e5e7eb")
                            : "#e5e7eb",
                        }}
                      >
                        {b.boothNumber}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-foreground block truncate text-sm font-semibold">
                          {b.merchantName ?? b.name ?? "Unassigned"}
                        </span>
                        {b.zoneId ? (
                          <span className="text-muted-foreground block text-xs">
                            {zoneById.get(b.zoneId)?.name}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
                {normalizedQuery && searchResults.length === 0 ? (
                  <li className="text-muted-foreground py-6 text-center text-sm">
                    No stalls match “{query}”.
                  </li>
                ) : null}
              </ul>
            </>
          ) : selected ? (
            /* ---- selected stall ---- */
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="app-eyebrow">Booth {selected.boothNumber}</p>
                  <h2 className="text-foreground mt-0.5 truncate text-xl font-extrabold tracking-tight">
                    {selected.listingTitle || selected.merchantName || "Unassigned booth"}
                  </h2>
                  {selected.zoneId ? (
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: zoneColorById.get(selected.zoneId) }}
                      />
                      {zoneById.get(selected.zoneId)?.name}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelectedId(null)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              {selected.merchantSlug ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => togglePlan(selected)}
                    className={cn(
                      "rounded-full px-4 py-2.5 text-sm font-bold",
                      inPlan(selected)
                        ? "border-border bg-secondary text-foreground border"
                        : "app-cta",
                    )}
                  >
                    {inPlan(selected) ? "✓ In plan — remove" : "+ Add to food plan"}
                  </button>
                  <Link
                    href={`${baseHref}/${selected.merchantSlug}`}
                    className="border-border text-foreground hover:bg-secondary rounded-full border px-4 py-2.5 text-sm font-semibold"
                  >
                    View stall →
                  </Link>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No merchant here yet.</p>
              )}
              <PlanPanel
                plan={plan}
                planBooths={planBooths}
                entranceId={entranceId}
                setEntranceId={setEntranceId}
                step={step}
                goToStep={goToStep}
                togglePlan={togglePlan}
                clearPlan={clearPlan}
                optimiseRoute={optimiseRoute}
                shareNative={shareNative}
                shareUrl={shareUrl}
                shareText={shareText}
                entrance={entrance}
                compact
              />
            </div>
          ) : (
            /* ---- default: the kchfest-style prompt ---- */
            <div className="grid gap-3">
              <div>
                <p className="app-eyebrow">Floor plan</p>
                <h2 className="text-foreground mt-1 text-xl font-extrabold tracking-tight">
                  Find a stall or merchant
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  All {floorBooths.length} stall positions are mapped. Search or select a stall to
                  see its details and plan a route from any of the four entrances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="app-cta w-full px-5 py-3.5 text-[15px]"
              >
                <Search className="size-4" aria-hidden /> Search merchants or stalls
              </button>
              <PlanPanel
                plan={plan}
                planBooths={planBooths}
                entranceId={entranceId}
                setEntranceId={setEntranceId}
                step={step}
                goToStep={goToStep}
                togglePlan={togglePlan}
                clearPlan={clearPlan}
                optimiseRoute={optimiseRoute}
                shareNative={shareNative}
                shareUrl={shareUrl}
                shareText={shareText}
                entrance={entrance}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** The food plan block — shown in the sheet under both the prompt and a stall. */
function PlanPanel({
  plan,
  planBooths,
  entranceId,
  setEntranceId,
  step,
  goToStep,
  togglePlan,
  clearPlan,
  optimiseRoute,
  shareNative,
  shareUrl,
  shareText,
  entrance,
  compact = false,
}: {
  plan: string[];
  planBooths: PublicMapBooth[];
  entranceId: string | null;
  setEntranceId: (v: string | null) => void;
  step: number | null;
  goToStep: (i: number) => void;
  togglePlan: (b: PublicMapBooth) => void;
  clearPlan: () => void;
  optimiseRoute: () => void;
  shareNative: () => void;
  shareUrl: () => string;
  shareText: () => string;
  entrance: Entrance | null;
  compact?: boolean;
}) {
  if (compact && plan.length === 0) return null;

  return (
    <div className="border-border border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="app-eyebrow">
          My food plan{plan.length ? ` · ${plan.length}` : ""}
        </h3>
        {plan.length > 0 ? (
          <button
            type="button"
            onClick={clearPlan}
            className="text-muted-foreground hover:text-foreground text-xs font-semibold underline-offset-4 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="text-muted-foreground self-center text-xs font-semibold">Start from</span>
        {ENTRANCES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setEntranceId(entranceId === e.id ? null : e.id)}
            aria-pressed={entranceId === e.id}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              entranceId === e.id
                ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]"
                : "border-border text-foreground hover:bg-secondary",
            )}
          >
            {e.label}
          </button>
        ))}
      </div>

      {plan.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Tap a stall on the map, then <span className="text-foreground font-semibold">Add to
          food plan</span> to build a route.
        </p>
      ) : (
        <>
          <ol className="mt-2.5 grid gap-1.5">
            {planBooths.map((b, i) => (
              <li
                key={b.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm",
                  step === i
                    ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,#fff)]"
                    : "border-border",
                )}
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[10px] font-extrabold text-[var(--brand-ink)]">
                  {i + 1}
                </span>
                <button type="button" onClick={() => goToStep(i)} className="min-w-0 flex-1 text-left">
                  <span className="text-foreground block truncate font-semibold">
                    {b.merchantName ?? b.name ?? "Stall"}
                  </span>
                  <span className="text-muted-foreground text-xs">Booth {b.boothNumber}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${b.merchantName ?? b.boothNumber} from plan`}
                  onClick={() => togglePlan(b)}
                  className="text-muted-foreground hover:text-foreground shrink-0 px-1.5"
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-3 grid gap-2">
            <button type="button" onClick={optimiseRoute} className="app-cta px-4 py-2.5 text-sm">
              <Expand className="size-4" aria-hidden />
              {entrance ? `Plan route from ${entrance.label}` : "Plan the best route"}
            </button>
            {step === null && planBooths.length > 0 ? (
              <button
                type="button"
                onClick={() => goToStep(0)}
                className="border-border text-foreground hover:bg-secondary rounded-full border px-4 py-2.5 text-sm font-semibold"
              >
                ▶ Start walking
              </button>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() =>
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(`${shareText()}\n${shareUrl()}`)}`,
                  "_blank",
                  "noopener",
                )
              }
              className="border-border text-foreground hover:bg-secondary rounded-full border py-2 text-center text-xs font-semibold"
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() =>
                window.open(
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
                  "_blank",
                  "noopener",
                )
              }
              className="border-border text-foreground hover:bg-secondary rounded-full border py-2 text-center text-xs font-semibold"
            >
              Facebook
            </button>
            <button
              type="button"
              onClick={shareNative}
              className="border-border text-foreground hover:bg-secondary rounded-full border py-2 text-center text-xs font-semibold"
            >
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  );
}
