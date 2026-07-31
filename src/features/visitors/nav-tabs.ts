/**
 * Which tabs the visitor app shows, and which one the current path belongs to.
 *
 * Two navs render this list — the bottom tab bar on mobile, the header strip on
 * desktop — so the rules live here rather than in either component. Kept pure
 * and JSX-free (icons are mapped in `components/tab-icons.ts`) so the path
 * matching is unit-testable without a DOM: "a merchant detail page counts as
 * Stalls" is the kind of rule that silently rots when it exists twice.
 *
 * This is chrome, not authorization. Hiding a tab keeps a visitor off a page
 * that would 404 anyway — the page itself still enforces visibility (§1 rule 6).
 */

export type VisitorTabKey = "home" | "stalls" | "map" | "moments" | "vouchers" | "saved";

/** Resolved event settings — the caller applies the per-setting defaults. */
export type VisitorFeatures = {
  map: boolean;
  moments: boolean;
  vouchers: boolean;
  favourites: boolean;
};

export type VisitorTab = {
  key: VisitorTabKey;
  label: string;
  /** Appended to the event base. `""` is the event home. */
  segment: string;
};

/** `feature: null` means the tab is always shown. */
const TABS: readonly (VisitorTab & { feature: keyof VisitorFeatures | null })[] = [
  { key: "home", label: "Home", segment: "", feature: null },
  { key: "stalls", label: "Stalls", segment: "/merchants", feature: null },
  { key: "map", label: "Floor plan", segment: "/map", feature: "map" },
  { key: "moments", label: "Moments", segment: "/moments", feature: "moments" },
  { key: "vouchers", label: "Vouchers", segment: "/vouchers", feature: "vouchers" },
  { key: "saved", label: "Saved", segment: "/favourites", feature: "favourites" },
];

/**
 * Segments directly under an event that are app routes. Anything else in that
 * position is a merchant slug — which is how a stall page knows to light up the
 * Stalls tab.
 */
const RESERVED = new Set(["merchants", "map", "moments", "vouchers", "favourites"]);

const BY_SEGMENT: Record<string, VisitorTabKey> = {
  merchants: "stalls",
  map: "map",
  moments: "moments",
  vouchers: "vouchers",
  favourites: "saved",
};

export function visitorTabs(features: VisitorFeatures): VisitorTab[] {
  return TABS.filter((tab) => tab.feature === null || features[tab.feature]).map(
    ({ key, label, segment }) => ({ key, label, segment }),
  );
}

/** `/{tenant}/{event}` for any path inside an event, else null. */
export function eventBaseFromPath(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean);
  return seg.length >= 2 ? `/${seg[0]}/${seg[1]}` : null;
}

export function activeTabKey(pathname: string): VisitorTabKey | null {
  const base = eventBaseFromPath(pathname);
  if (base === null) return null;

  const rest = pathname.slice(base.length).split("/").filter(Boolean);
  if (rest.length === 0) return "home";

  const first = rest[0]!;
  // A merchant detail page (`/{tenant}/{event}/{merchantSlug}`) belongs to Stalls.
  return RESERVED.has(first) ? (BY_SEGMENT[first] ?? null) : "stalls";
}
