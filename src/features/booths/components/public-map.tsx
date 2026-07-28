"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { BOOTH_STATUS_COLORS, type BoothStatus } from "@/server/booths/status";

/**
 * The public interactive event map (spec §8.6), Night Market Neon look: a
 * festival floor plan with a "Food Plan" route builder alongside it.
 *
 * - Drag to pan, wheel/pinch to zoom, buttons to zoom/reset.
 * - Booths are numbered pills coloured by zone; tap one for its merchant.
 * - Add stalls to a Food Plan, pick an entrance, and the plan orders itself into
 *   a walking route (nearest-neighbour) drawn over the map. Step through it
 *   stop-by-stop, and share it (WhatsApp / Facebook / copy) — the plan lives in
 *   the URL, so a shared link reopens the same route, and on the device so it
 *   survives a reload. All client-side; no new server surface.
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
type Entrance = { id: string; label: string; x: number; y: number };

// Four schematic gates on the edges — no venue geometry, so routes between them
// and the stalls are approximate straight lines (as flagged to the organizer).
const ENTRANCES: readonly Entrance[] = [
  { id: "north", label: "North Gate", x: 0.5, y: 0.05 },
  { id: "east", label: "East Gate", x: 0.95, y: 0.5 },
  { id: "south", label: "South Gate", x: 0.5, y: 0.95 },
  { id: "west", label: "West Gate", x: 0.05, y: 0.5 },
];

// Vivid zone palette for the dark ground, used when a zone has no colour of its
// own. Assigned by zone order so the map and legend always agree.
const ZONE_PALETTE = [
  "#ff2d78",
  "#ff8a3d",
  "#c6f24e",
  "#39d98a",
  "#38bdf8",
  "#a78bfa",
  "#fb7185",
  "#facc15",
];

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function PublicMap({
  baseHref,
  eventName,
  floors,
  booths,
  zones,
  initialBooth,
}: {
  baseHref: string;
  eventName: string;
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
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  // Food Plan state — an ordered list of booth numbers, an optional entrance,
  // and the current step when walking the route. Seeded from the URL
  // (?plan=A1,C3&from=north) so a shared link — or a plain reload, since we mirror
  // the plan back into the URL — reopens the same route. Reading it in the state
  // initializer keeps SSR and the first client render identical (no localStorage,
  // so no post-hydration setState).
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

  // Mirror the plan back into the URL (via replaceState, so it doesn't trigger a
  // navigation) whenever it changes — that's what makes it shareable and
  // reload-proof. Skips the first run so the initial URL is left untouched.
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
    const query = qs.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, entranceId]);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;
  const aspect =
    activeFloor?.imageWidth && activeFloor?.imageHeight
      ? activeFloor.imageWidth / activeFloor.imageHeight
      : 3 / 2;

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
    (b: PublicMapBooth) =>
      !matchesSearch(b) || (zoneFilter !== null && b.zoneId !== zoneFilter),
    [matchesSearch, zoneFilter],
  );

  const selected = booths.find((b) => b.id === selectedId) ?? null;

  const planIndexByNumber = useMemo(() => {
    const map = new Map<string, number>();
    plan.forEach((n, i) => map.set(n.toLowerCase(), i));
    return map;
  }, [plan]);

  const planBooths = useMemo(
    () => plan.map((n) => boothByNumber.get(n.toLowerCase())).filter((b): b is PublicMapBooth => Boolean(b)),
    [plan, boothByNumber],
  );

  const entrance = ENTRANCES.find((e) => e.id === entranceId) ?? null;

  // Route points: entrance (if chosen) then each stop, in plan order.
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

  const focusPoint = useCallback((p: Point, toScale = 2.6) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp(toScale, MIN_SCALE, MAX_SCALE);
    setScale(s);
    setTx(rect.width / 2 - p.x * rect.width * s);
    setTy(rect.height / 2 - p.y * rect.height * s);
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
  const whatsappHref = () =>
    `https://wa.me/?text=${encodeURIComponent(`${shareText()}\n${shareUrl()}`)}`;
  const facebookHref = () =>
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`;

  const zoomBtn =
    "grid size-9 place-items-center rounded-full border border-white/16 bg-white/8 text-white transition-colors hover:bg-white/14";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* ============================================================ MAP */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stall or booth…"
            aria-label="Search stall or booth"
            className="h-10 min-w-0 flex-1 rounded-full border border-white/16 bg-white/8 px-4 text-sm text-white outline-none transition-colors placeholder:text-white/45 focus:border-[var(--brand)] focus:bg-white/12"
          />
          {floors.length > 1 ? (
            <select
              value={activeFloorId}
              onChange={(e) => {
                setActiveFloorId(e.target.value);
                resetView();
              }}
              aria-label="Floor"
              className="h-10 rounded-full border border-white/16 bg-white/8 px-3 text-sm text-white outline-none [&>option]:bg-[#26123f]"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => zoomAround(0, 0, 1 / 1.3)}>
              −
            </button>
            <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => zoomAround(0, 0, 1.3)}>
              +
            </button>
            <button
              type="button"
              onClick={resetView}
              className="rounded-full border border-white/16 bg-white/8 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/14"
            >
              Reset
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ aspectRatio: String(aspect) }}
          className="relative w-full touch-none overflow-hidden rounded-2xl border border-white/12 bg-[#160a29] select-none"
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
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff14_1px,transparent_1px),linear-gradient(to_bottom,#ffffff14_1px,transparent_1px)] bg-[size:5%_7.5%]" />
            )}

            {/* route lines: entrance → stops, in plan order */}
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
                  stroke="var(--neon-lime, #c6f24e)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
              </svg>
            ) : null}

            {/* entrances */}
            {entrance || plan.length === 0
              ? ENTRANCES.map((e) => {
                  const active = e.id === entranceId;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      data-booth
                      onClick={() => setEntranceId((cur) => (cur === e.id ? null : e.id))}
                      style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
                      className={cn(
                        "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-[10px] font-bold whitespace-nowrap transition-colors",
                        active
                          ? "border-[var(--neon-lime)] bg-[var(--neon-lime)] text-[#14061f]"
                          : "border-white/25 bg-black/55 text-white/85 backdrop-blur hover:bg-black/70",
                      )}
                    >
                      <span style={{ transform: `scale(${1 / Math.max(1, scale)})` }} className="inline-block">
                        ▟ {e.label}
                      </span>
                    </button>
                  );
                })
              : null}

            {/* booths */}
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
                  onClick={() => setSelectedId(booth.id)}
                  style={{
                    left: `${(booth.x - booth.width / 2) * 100}%`,
                    top: `${(booth.y - booth.height / 2) * 100}%`,
                    width: `${booth.width * 100}%`,
                    height: `${booth.height * 100}%`,
                    transform: `rotate(${booth.rotation}deg)`,
                    backgroundColor: dimmed ? `${color}55` : `${color}e6`,
                    borderColor: color,
                    opacity: dimmed ? 0.4 : 1,
                    boxShadow: isStep ? `0 0 0 3px #fff, 0 0 16px ${color}` : undefined,
                  }}
                  className={cn(
                    "absolute flex items-center justify-center rounded-md border text-[9px] font-bold text-[#14061f]",
                    booth.merchantSlug ? "cursor-pointer" : "cursor-default",
                    isSelected && !isStep && "ring-2 ring-white",
                  )}
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
                      className="pointer-events-none absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-[var(--neon-lime)] text-[8px] font-extrabold text-[#14061f]"
                      style={{ transform: `scale(${1 / Math.max(1, scale)})` }}
                    >
                      {planIdx + 1}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* stop counter overlay while walking a route */}
          {step !== null && planBooths.length > 0 ? (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-full border border-white/15 bg-black/70 px-3 py-2 text-sm backdrop-blur">
              <button
                type="button"
                onClick={() => goToStep(step - 1)}
                disabled={step === 0}
                className="rounded-full px-3 py-1 font-semibold text-white disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-center text-xs text-white/80">
                Stop <span className="font-bold text-[var(--neon-lime)]">{step + 1}</span> / {planBooths.length}
                <span className="block truncate font-semibold text-white">
                  {planBooths[step]?.merchantName ?? planBooths[step]?.name ?? planBooths[step]?.boothNumber}
                </span>
              </span>
              {step + 1 < planBooths.length ? (
                <button
                  type="button"
                  onClick={() => goToStep(step + 1)}
                  className="rounded-full bg-[var(--neon-lime)] px-3 py-1 font-bold text-[#14061f]"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(null)}
                  className="rounded-full bg-white/15 px-3 py-1 font-bold text-white"
                >
                  Done
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* zone legend / filter */}
        {zones.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {zones.map((z) => {
              const on = zoneFilter === z.id;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZoneFilter((cur) => (cur === z.id ? null : z.id))}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                    on
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/12 bg-white/5 text-white/70 hover:bg-white/10",
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
            {zoneFilter ? (
              <button
                type="button"
                onClick={() => setZoneFilter(null)}
                className="text-xs font-semibold text-white/55 underline-offset-4 hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ======================================================== SIDEBAR */}
      <aside className="grid content-start gap-4">
        {/* selected booth detail */}
        {selected ? (
          <BoothDetail
            baseHref={baseHref}
            booth={selected}
            zoneColor={selected.zoneId ? zoneColorById.get(selected.zoneId) : undefined}
            zoneName={selected.zoneId ? zoneById.get(selected.zoneId)?.name : undefined}
            inPlan={inPlan(selected)}
            onTogglePlan={() => togglePlan(selected)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <p className="neon-surface rounded-2xl px-4 py-3 text-sm text-white/60">
            Tap a stall on the map for details, or add stalls to your food plan.
          </p>
        )}

        {/* food plan */}
        <div className="neon-surface rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-bold tracking-[0.14em] text-[var(--neon-lime)] uppercase">
              My food plan
            </h2>
            {plan.length > 0 ? (
              <button
                type="button"
                onClick={clearPlan}
                className="text-xs font-semibold text-white/55 underline-offset-4 hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* entrance picker */}
          <label className="mt-3 block text-xs font-semibold text-white/60">Start from</label>
          <select
            value={entranceId ?? ""}
            onChange={(e) => setEntranceId(e.target.value || null)}
            className="mt-1 h-9 w-full rounded-lg border border-white/16 bg-white/8 px-3 text-sm text-white outline-none focus:border-[var(--brand)] [&>option]:bg-[#26123f]"
          >
            <option value="">Choose an entrance…</option>
            {ENTRANCES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>

          {plan.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">
              No stops yet. Tap a stall → <span className="font-semibold text-white/70">Add to plan</span> to build a
              route.
            </p>
          ) : (
            <>
              <ol className="mt-3 grid gap-1.5">
                {planBooths.map((b, i) => (
                  <li
                    key={b.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors",
                      step === i
                        ? "border-[var(--neon-lime)]/60 bg-[var(--neon-lime)]/12"
                        : "border-white/10 bg-white/5",
                    )}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--neon-lime)] text-[10px] font-extrabold text-[#14061f]">
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToStep(i)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate font-semibold text-white">
                        {b.merchantName ?? b.name ?? "Stall"}
                      </span>
                      <span className="text-xs text-white/50">Booth {b.boothNumber}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${b.merchantName ?? b.boothNumber} from plan`}
                      onClick={() => togglePlan(b)}
                      className="shrink-0 rounded-full px-1.5 text-white/45 hover:text-white"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ol>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={optimiseRoute}
                  className="neon-cta col-span-2 px-4 py-2.5 text-sm"
                >
                  {entrance ? `Plan route from ${entrance.label}` : "Plan the best route"}
                </button>
                {step === null && planBooths.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => goToStep(0)}
                    className="col-span-2 rounded-full border border-white/16 bg-white/8 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/14"
                  >
                    ▶ Start walking
                  </button>
                ) : null}
              </div>

              {/* share */}
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="mb-2 text-xs font-semibold text-white/60">Share this route</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(whatsappHref(), "_blank", "noopener")}
                    className="rounded-full border border-white/16 bg-white/8 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-white/14"
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(facebookHref(), "_blank", "noopener")}
                    className="rounded-full border border-white/16 bg-white/8 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-white/14"
                  >
                    Facebook
                  </button>
                  <button
                    type="button"
                    onClick={shareNative}
                    className="rounded-full border border-white/16 bg-white/8 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-white/14"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function BoothDetail({
  baseHref,
  booth,
  zoneColor,
  zoneName,
  inPlan,
  onTogglePlan,
  onClose,
}: {
  baseHref: string;
  booth: PublicMapBooth;
  zoneColor?: string;
  zoneName?: string;
  inPlan: boolean;
  onTogglePlan: () => void;
  onClose: () => void;
}) {
  return (
    <div className="neon-surface grid gap-2 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white">
            Booth {booth.boothNumber}
          </span>
          {zoneName ? (
            <span className="flex items-center gap-1 text-xs text-white/60">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: zoneColor ?? "transparent" }} />
              {zoneName}
            </span>
          ) : null}
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="shrink-0 text-white/45 hover:text-white">
          ✕
        </button>
      </div>
      <p className="font-bold tracking-tight text-white">
        {booth.listingTitle || booth.merchantName || booth.name || "Unassigned booth"}
      </p>
      {booth.merchantSlug ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTogglePlan}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition-colors",
              inPlan
                ? "border border-white/16 bg-white/8 text-white hover:bg-white/14"
                : "neon-cta",
            )}
          >
            {inPlan ? "✓ In plan — remove" : "+ Add to plan"}
          </button>
          <Link
            href={`${baseHref}/${booth.merchantSlug}`}
            className="rounded-full border border-white/16 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/14"
          >
            View stall →
          </Link>
        </div>
      ) : (
        <p className="text-sm text-white/50">No merchant here yet.</p>
      )}
    </div>
  );
}
