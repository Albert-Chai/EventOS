import type { CSSProperties } from "react";

/**
 * Night Market Neon theming helpers (see globals.css `.neon`).
 *
 * The visitor tree is a committed dark look, but each event still leads with its
 * own brand colour (spec §1, white-label). `brandStyle` sets `--brand` inline on
 * an event's root element; the hero glow and primary CTAs derive from it, while
 * the fixed festival palette (plum ground, lime signal) stays constant.
 */
export function brandStyle(primaryColor: string | null | undefined): CSSProperties {
  return { "--brand": primaryColor || "#ff2d78" } as CSSProperties;
}

/**
 * A stable 0–359 hue derived from a slug, so a merchant with no photo always
 * gets the same colourful gradient art tile (`.neon-art`). Deterministic — no
 * `Math.random()`, safe to run during a Server Component render.
 */
export function artHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** Inline style carrying the art-tile hue for `.neon-art`. */
export function artStyle(seed: string): CSSProperties {
  return { "--art-h": artHue(seed) } as CSSProperties;
}
