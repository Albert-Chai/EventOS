"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BOOTH_STATUS_COLORS, type BoothStatus } from "@/server/booths/status";

/**
 * The public interactive event map (spec §8.6): an image-based floor plan with
 * booths plotted over it. Pan by dragging, zoom with the wheel or buttons, search
 * by booth number or merchant, tap a booth to open its merchant. Coordinates are
 * normalized (centre), so booths land correctly at any size — mobile included.
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

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function PublicMap({
  baseHref,
  floors,
  booths,
  zones,
  initialBooth,
}: {
  baseHref: string;
  floors: PublicMapFloor[];
  booths: PublicMapBooth[];
  zones: PublicMapZone[];
  initialBooth?: string;
}) {
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

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
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;
  const aspect =
    activeFloor?.imageWidth && activeFloor?.imageHeight
      ? activeFloor.imageWidth / activeFloor.imageHeight
      : 4 / 3;

  const floorBooths = useMemo(
    () =>
      booths.filter((b) =>
        activeFloorId === "__none__" ? !b.mapFloorId : b.mapFloorId === activeFloorId,
      ),
    [booths, activeFloorId],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useCallback(
    (b: PublicMapBooth) =>
      normalizedQuery.length === 0 ||
      b.boothNumber.toLowerCase().includes(normalizedQuery) ||
      (b.merchantName?.toLowerCase().includes(normalizedQuery) ?? false) ||
      (b.listingTitle?.toLowerCase().includes(normalizedQuery) ?? false),
    [normalizedQuery],
  );

  const otherFloorMatches = useMemo(
    () =>
      normalizedQuery.length === 0
        ? 0
        : booths.filter((b) => b.mapFloorId !== activeFloorId && matches(b)).length,
    [booths, activeFloorId, matches, normalizedQuery],
  );

  const selected = booths.find((b) => b.id === selectedId) ?? null;

  const resetView = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search booth or merchant"
          aria-label="Search booth or merchant"
          className="border-input h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-3 text-sm outline-none"
        />
        {floors.length > 1 ? (
          <select
            value={activeFloorId}
            onChange={(e) => {
              setActiveFloorId(e.target.value);
              resetView();
            }}
            aria-label="Floor"
            className="border-input h-9 rounded-lg border bg-transparent px-2 text-sm"
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            onClick={() => zoomAround(0, 0, 1 / 1.3)}
          >
            −
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            onClick={() => zoomAround(0, 0, 1.3)}
          >
            +
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={resetView}>
            Reset
          </Button>
        </div>
      </div>

      {otherFloorMatches > 0 ? (
        <p className="text-muted-foreground text-xs">
          {otherFloorMatches} more match{otherFloorMatches === 1 ? "" : "es"} on other floors.
        </p>
      ) : null}

      <div
        ref={viewportRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ aspectRatio: String(aspect) }}
        className="bg-muted relative w-full touch-none overflow-hidden rounded-lg border select-none"
      >
        <div
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
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
            <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:24px_24px]" />
          )}

          {floorBooths.map((booth) => {
            const color = booth.zoneId
              ? (zoneById.get(booth.zoneId)?.color ?? BOOTH_STATUS_COLORS[booth.status])
              : BOOTH_STATUS_COLORS[booth.status];
            const isMatch = matches(booth);
            const isSelected = booth.id === selectedId;
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
                  backgroundColor: `${color}cc`,
                  borderColor: color,
                  opacity: isMatch ? 1 : 0.25,
                }}
                className={cn(
                  "absolute flex items-center justify-center rounded border text-[9px] font-semibold text-white",
                  booth.merchantSlug ? "cursor-pointer" : "cursor-default",
                  isSelected && "ring-2 ring-white ring-offset-1",
                )}
                aria-label={`Booth ${booth.boothNumber}${
                  booth.merchantName ? `, ${booth.merchantName}` : ""
                }`}
              >
                <span
                  className="pointer-events-none max-w-full truncate px-0.5"
                  style={{ transform: `scale(${1 / Math.max(1, scale)})` }}
                >
                  {booth.boothNumber}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <BoothDetail
          baseHref={baseHref}
          booth={selected}
          zone={selected.zoneId ? zoneById.get(selected.zoneId) : undefined}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Tap a booth for details.</p>
      )}

      {zones.length > 0 ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {zones.map((z) => (
            <span key={z.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-full border"
                style={{ backgroundColor: z.color ?? "transparent" }}
              />
              {z.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoothDetail({
  baseHref,
  booth,
  zone,
}: {
  baseHref: string;
  booth: PublicMapBooth;
  zone?: PublicMapZone;
}) {
  return (
    <div className="grid gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">Booth {booth.boothNumber}</span>
        {booth.name ? <span className="text-muted-foreground text-sm">{booth.name}</span> : null}
        {zone ? (
          <span className="flex items-center gap-1 text-xs">
            <span
              aria-hidden
              className="size-2.5 rounded-full border"
              style={{ backgroundColor: zone.color ?? "transparent" }}
            />
            {zone.name}
          </span>
        ) : null}
      </div>
      {booth.merchantSlug ? (
        <>
          <p className="text-sm">{booth.listingTitle || booth.merchantName}</p>
          <Link
            href={`${baseHref}/${booth.merchantSlug}`}
            className="text-sm underline underline-offset-4"
          >
            View listing →
          </Link>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">No merchant here yet.</p>
      )}
    </div>
  );
}
