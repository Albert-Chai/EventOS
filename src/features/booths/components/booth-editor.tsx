"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import { BOOTH_STATUS_COLORS, type BoothStatus } from "@/server/booths/status";

import { moveBoothAction } from "../actions";

/**
 * The coordinate editor (spec §8.6): booths plotted over an uploaded floor plan,
 * dragged to place. Coordinates are normalized — `x`/`y` are the booth's *centre*
 * as a fraction of the image (0..1), so a booth renders in the same spot at any
 * display size, including 390px. Each drop persists via `moveBoothAction`.
 *
 * With no floor image, booths are plotted on a plain grid so placement still
 * works before a plan is uploaded.
 */

export type EditorFloor = {
  id: string;
  name: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
};

export type EditorBooth = {
  id: string;
  boothNumber: string;
  mapFloorId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: BoothStatus;
  zoneColor: string | null;
  merchantName: string | null;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function BoothEditor({
  eventId,
  floors,
  booths,
}: {
  eventId: string;
  floors: EditorFloor[];
  booths: EditorBooth[];
}) {
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id ?? "__none__");
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? null;
  const aspect =
    activeFloor?.imageWidth && activeFloor?.imageHeight
      ? `${activeFloor.imageWidth} / ${activeFloor.imageHeight}`
      : "4 / 3";

  // Booths on this floor, or unplaced booths (no floor) shown on the "unplaced" view.
  const visibleBooths = useMemo(() => {
    if (activeFloorId === "__none__") return booths.filter((b) => !b.mapFloorId);
    return booths.filter((b) => b.mapFloorId === activeFloorId);
  }, [booths, activeFloorId]);

  function pointToNormalized(clientX: number, clientY: number) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function onPointerDown(event: React.PointerEvent, booth: EditorBooth) {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragId.current = booth.id;
    setSelectedId(booth.id);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragId.current) return;
    const next = pointToNormalized(event.clientX, event.clientY);
    setPositions((p) => ({ ...p, [dragId.current!]: next }));
  }

  function onPointerUp() {
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;
    const booth = booths.find((b) => b.id === id);
    const pos = positions[id];
    if (!booth || !pos) return;
    startTransition(async () => {
      await moveBoothAction({
        eventId,
        boothId: id,
        x: pos.x,
        y: pos.y,
        width: booth.width,
        height: booth.height,
        rotation: booth.rotation,
      });
    });
  }

  function pos(booth: EditorBooth) {
    return positions[booth.id] ?? { x: booth.x, y: booth.y };
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="editor-floor" className="text-muted-foreground text-sm">
          Floor
        </label>
        <select
          id="editor-floor"
          value={activeFloorId}
          onChange={(e) => setActiveFloorId(e.target.value)}
          className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
          <option value="__none__">Unplaced booths</option>
        </select>
        <span className="text-muted-foreground text-xs">Drag a booth to place it.</span>
      </div>

      <div
        ref={surfaceRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ aspectRatio: aspect }}
        className={cn(
          "bg-muted relative w-full touch-none overflow-hidden rounded-lg border select-none",
          !activeFloor?.imageUrl &&
            "bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:24px_24px]",
        )}
      >
        {activeFloor?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- floor plan from Storage; overlay needs raw sizing
          <img
            src={activeFloor.imageUrl}
            alt={`${activeFloor.name} floor plan`}
            className="pointer-events-none absolute inset-0 size-full object-contain"
          />
        ) : null}

        {visibleBooths.length === 0 ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-4 text-center text-sm">
            {activeFloorId === "__none__"
              ? "Every booth is placed on a floor."
              : "No booths on this floor yet. Add one, then drag it here."}
          </p>
        ) : null}

        {visibleBooths.map((booth) => {
          const p = pos(booth);
          const color = booth.zoneColor ?? BOOTH_STATUS_COLORS[booth.status];
          return (
            <button
              type="button"
              key={booth.id}
              onPointerDown={(e) => onPointerDown(e, booth)}
              style={{
                left: `${(p.x - booth.width / 2) * 100}%`,
                top: `${(p.y - booth.height / 2) * 100}%`,
                width: `${booth.width * 100}%`,
                height: `${booth.height * 100}%`,
                transform: `rotate(${booth.rotation}deg)`,
                backgroundColor: `${color}cc`,
                borderColor: color,
              }}
              className={cn(
                "absolute flex cursor-grab items-center justify-center rounded border-2 text-[10px] font-semibold text-white active:cursor-grabbing",
                selectedId === booth.id && "ring-primary ring-2 ring-offset-1",
              )}
              title={booth.merchantName ?? booth.boothNumber}
              aria-label={`Booth ${booth.boothNumber}${booth.merchantName ? `, ${booth.merchantName}` : ""}`}
            >
              <span className="pointer-events-none max-w-full truncate px-0.5">
                {booth.boothNumber}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
