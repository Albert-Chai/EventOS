import { describe, expect, it } from "vitest";

import {
  activeTabKey,
  eventBaseFromPath,
  visitorTabs,
  type VisitorFeatures,
} from "@/features/visitors/nav-tabs";

/**
 * The visitor nav rules. Two components render this list — the bottom bar on a
 * phone, the header strip from `lg` — so the matching lives in one pure module
 * and is pinned here. The case that keeps regressing by hand is the last one: a
 * merchant detail page sits directly under the event, so it looks like an app
 * route but has to light up **Stalls**.
 */
const ALL: VisitorFeatures = { map: true, moments: true, vouchers: true, favourites: true };
const NONE: VisitorFeatures = { map: false, moments: false, vouchers: false, favourites: false };

describe("visitorTabs", () => {
  it("always offers home and stalls, whatever is switched off", () => {
    expect(visitorTabs(NONE).map((t) => t.key)).toEqual(["home", "stalls"]);
  });

  it("adds a tab per enabled feature, in a stable order", () => {
    expect(visitorTabs(ALL).map((t) => t.key)).toEqual([
      "home",
      "stalls",
      "map",
      "moments",
      "vouchers",
      "saved",
    ]);
  });

  it("omits only the features that are off", () => {
    expect(visitorTabs({ ...NONE, vouchers: true }).map((t) => t.key)).toEqual([
      "home",
      "stalls",
      "vouchers",
    ]);
  });

  it("points home at the event root, not a sub-path", () => {
    expect(visitorTabs(ALL).find((t) => t.key === "home")?.segment).toBe("");
  });
});

describe("eventBaseFromPath", () => {
  it("takes the first two segments", () => {
    expect(eventBaseFromPath("/acme/spring-fair")).toBe("/acme/spring-fair");
    expect(eventBaseFromPath("/acme/spring-fair/merchants?q=x")).toBe("/acme/spring-fair");
  });

  it("is null above an event, where there is no nav to render", () => {
    expect(eventBaseFromPath("/")).toBeNull();
    expect(eventBaseFromPath("/acme")).toBeNull();
  });
});

describe("activeTabKey", () => {
  const base = "/acme/spring-fair";

  it("matches the event root to home", () => {
    expect(activeTabKey(base)).toBe("home");
    expect(activeTabKey(`${base}/`)).toBe("home");
  });

  it("maps each app route to its tab", () => {
    expect(activeTabKey(`${base}/merchants`)).toBe("stalls");
    expect(activeTabKey(`${base}/map`)).toBe("map");
    expect(activeTabKey(`${base}/moments`)).toBe("moments");
    expect(activeTabKey(`${base}/vouchers`)).toBe("vouchers");
    // The label is "Saved" but the route is /favourites — they must not drift.
    expect(activeTabKey(`${base}/favourites`)).toBe("saved");
  });

  it("keeps the tab lit on nested routes", () => {
    expect(activeTabKey(`${base}/moments/abc-123`)).toBe("moments");
    expect(activeTabKey(`${base}/moments/new`)).toBe("moments");
    expect(activeTabKey(`${base}/vouchers/mine`)).toBe("vouchers");
  });

  it("treats a merchant detail page as Stalls", () => {
    // `/{tenant}/{event}/{merchantSlug}` is the one route in that position that
    // isn't an app section — it belongs to the directory it was reached from.
    expect(activeTabKey(`${base}/nasi-lemak-nusantara`)).toBe("stalls");
    expect(activeTabKey(`${base}/satay-bara-kl`)).toBe("stalls");
  });

  it("is null where there is no event", () => {
    expect(activeTabKey("/acme")).toBeNull();
    expect(activeTabKey("/")).toBeNull();
  });
});
