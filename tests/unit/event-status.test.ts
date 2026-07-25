import { describe, expect, it } from "vitest";

import { isEventType, isPubliclyListable, isPubliclyReachable } from "@/server/events/event-types";
import {
  allowedTransitions,
  canTransition,
  eventPhase,
  isEventStatus,
  isPublicStatus,
  permissionForTransition,
  PUBLIC_STATUSES,
} from "@/server/events/status";

/**
 * The event status machine is critical business logic (CLAUDE §7.5), so the
 * transition rules, the per-transition permission, and the public-visibility
 * predicate are all pinned here — no database required.
 */
describe("event status machine", () => {
  it("permits the documented forward moves", () => {
    expect(canTransition("draft", "setup")).toBe(true);
    expect(canTransition("draft", "published")).toBe(true); // small events skip setup
    expect(canTransition("setup", "merchant_onboarding")).toBe(true);
    expect(canTransition("ready_for_review", "published")).toBe(true);
    expect(canTransition("published", "live")).toBe(true);
    expect(canTransition("live", "ended")).toBe(true);
    expect(canTransition("ended", "archived")).toBe(true);
  });

  it("permits unpublish (published → draft) and cancel from any live-ish state", () => {
    expect(canTransition("published", "draft")).toBe(true);
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("published", "cancelled")).toBe(true);
    expect(canTransition("live", "cancelled")).toBe(true);
  });

  it("rejects illegal jumps and self-transitions", () => {
    expect(canTransition("draft", "live")).toBe(false); // can't skip publish
    expect(canTransition("draft", "ended")).toBe(false);
    expect(canTransition("ended", "published")).toBe(false); // no resurrection
    expect(canTransition("draft", "draft")).toBe(false);
  });

  it("treats archived and cancelled as (near-)terminal", () => {
    expect(allowedTransitions("archived")).toEqual([]);
    expect(canTransition("cancelled", "archived")).toBe(true);
    expect(canTransition("cancelled", "published")).toBe(false);
  });

  it("requires the right permission per transition target", () => {
    expect(permissionForTransition("published")).toBe("event.publish");
    expect(permissionForTransition("live")).toBe("event.publish");
    expect(permissionForTransition("archived")).toBe("event.archive");
    expect(permissionForTransition("setup")).toBe("event.update");
    expect(permissionForTransition("cancelled")).toBe("event.update");
    expect(permissionForTransition("ended")).toBe("event.update");
  });

  it("marks only published/live/ended as public", () => {
    expect(isPublicStatus("published")).toBe(true);
    expect(isPublicStatus("live")).toBe(true);
    expect(isPublicStatus("ended")).toBe(true);
    expect(isPublicStatus("draft")).toBe(false);
    expect(isPublicStatus("ready_for_review")).toBe(false);
    expect(isPublicStatus("cancelled")).toBe(false);
    expect([...PUBLIC_STATUSES].sort()).toEqual(["ended", "live", "published"]);
  });

  it("validates status strings", () => {
    expect(isEventStatus("published")).toBe(true);
    expect(isEventStatus("nonsense")).toBe(false);
  });
});

describe("eventPhase (date-derived label)", () => {
  const start = new Date("2026-08-01T10:00:00Z");
  const end = new Date("2026-08-03T22:00:00Z");

  it("is upcoming before the start", () => {
    expect(eventPhase("published", start, end, new Date("2026-07-20T00:00:00Z"))).toBe("upcoming");
  });

  it("is live within the window", () => {
    expect(eventPhase("published", start, end, new Date("2026-08-02T12:00:00Z"))).toBe("live");
  });

  it("is ended after the end", () => {
    expect(eventPhase("published", start, end, new Date("2026-08-10T00:00:00Z"))).toBe("ended");
  });

  it("respects an explicitly ended status even mid-window", () => {
    expect(eventPhase("ended", start, end, new Date("2026-08-02T12:00:00Z"))).toBe("ended");
  });
});

describe("event type & visibility", () => {
  it("validates event types", () => {
    expect(isEventType("food_festival")).toBe(true);
    expect(isEventType("wedding")).toBe(false);
  });

  it("computes public reachability and listability from visibility", () => {
    expect(isPubliclyReachable("public")).toBe(true);
    expect(isPubliclyReachable("unlisted")).toBe(true);
    expect(isPubliclyReachable("private")).toBe(false);

    expect(isPubliclyListable("public")).toBe(true);
    expect(isPubliclyListable("unlisted")).toBe(false);
    expect(isPubliclyListable("private")).toBe(false);
  });
});
