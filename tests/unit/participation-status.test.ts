import { describe, expect, it } from "vitest";

import {
  actorForParticipationTransition,
  allowedParticipationTransitions,
  canTransitionParticipation,
  isParticipationStatus,
  isPublicParticipation,
  permissionForReview,
} from "@/server/merchants/status";

/**
 * The merchant approval workflow is critical business logic (CLAUDE §7.5): the
 * transitions, who may make each, the review permission, and public visibility
 * are pinned here — no database required.
 */
describe("participation approval machine", () => {
  it("walks the happy path", () => {
    expect(canTransitionParticipation("draft", "submitted")).toBe(true);
    expect(canTransitionParticipation("submitted", "approved")).toBe(true);
  });

  it("supports the review verdicts and resubmission", () => {
    expect(canTransitionParticipation("submitted", "changes_requested")).toBe(true);
    expect(canTransitionParticipation("submitted", "rejected")).toBe(true);
    expect(canTransitionParticipation("changes_requested", "submitted")).toBe(true);
    expect(canTransitionParticipation("changes_requested", "draft")).toBe(true);
  });

  it("rejects illegal moves", () => {
    expect(canTransitionParticipation("draft", "approved")).toBe(false); // must submit first
    expect(canTransitionParticipation("approved", "submitted")).toBe(false);
    expect(canTransitionParticipation("draft", "draft")).toBe(false);
  });

  it("treats rejected as terminal and withdrawn as revivable", () => {
    expect(allowedParticipationTransitions("rejected")).toEqual([]);
    expect(canTransitionParticipation("withdrawn", "draft")).toBe(true);
    expect(canTransitionParticipation("approved", "withdrawn")).toBe(true);
  });

  it("assigns each transition to the right actor", () => {
    expect(actorForParticipationTransition("submitted")).toBe("merchant");
    expect(actorForParticipationTransition("withdrawn")).toBe("merchant");
    expect(actorForParticipationTransition("draft")).toBe("merchant");
    expect(actorForParticipationTransition("approved")).toBe("organizer");
    expect(actorForParticipationTransition("changes_requested")).toBe("organizer");
    expect(actorForParticipationTransition("rejected")).toBe("organizer");
  });

  it("maps review verdicts to permissions", () => {
    expect(permissionForReview("approved")).toBe("merchant.approve");
    expect(permissionForReview("changes_requested")).toBe("merchant.reject");
    expect(permissionForReview("rejected")).toBe("merchant.reject");
  });

  it("is public only when approved", () => {
    expect(isPublicParticipation("approved")).toBe(true);
    expect(isPublicParticipation("submitted")).toBe(false);
    expect(isPublicParticipation("draft")).toBe(false);
    expect(isPublicParticipation("withdrawn")).toBe(false);
  });

  it("validates status strings", () => {
    expect(isParticipationStatus("approved")).toBe(true);
    expect(isParticipationStatus("nope")).toBe(false);
  });
});
