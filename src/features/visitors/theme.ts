import type { CSSProperties } from "react";

/**
 * Visitor app-shell theming helpers (see globals.css `.appshell`).
 *
 * The visitor tree is a light festival app, but each event leads with its own
 * brand colour (spec §1, white-label). `brandStyle` sets `--brand` inline on an
 * event's root element; the header, primary CTAs and accents derive from it,
 * while the fixed light palette stays constant across every event.
 */
export function brandStyle(primaryColor: string | null | undefined): CSSProperties {
  return { "--brand": primaryColor || "#e11d48" } as CSSProperties;
}

/**
 * A stable 0–359 hue derived from a slug, so a merchant with no photo always
 * gets the same colourful gradient art tile (`.app-art`). Deterministic — no
 * `Math.random()`, safe to run during a Server Component render.
 */
export function artHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** Inline style carrying the art-tile hue for `.app-art`. */
export function artStyle(seed: string): CSSProperties {
  return { "--art-h": artHue(seed) } as CSSProperties;
}
