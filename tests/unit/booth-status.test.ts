import { describe, expect, it } from "vitest";

import {
  boothStatusForAssignment,
  canTransitionAssignment,
  isActiveAssignment,
  isAssignableBoothStatus,
  isAssignmentStatus,
  isBoothStatus,
  isOrganizerSettableBoothStatus,
} from "@/server/booths/status";

/**
 * The booth + assignment machines are critical business logic (CLAUDE §7.5):
 * which booths accept an assignment, how the assignment lifecycle moves, and how
 * the booth's status follows it are pinned here — no database required.
 */
describe("booth status", () => {
  it("recognises valid statuses", () => {
    expect(isBoothStatus("available")).toBe(true);
    expect(isBoothStatus("confirmed")).toBe(true);
    expect(isBoothStatus("nope")).toBe(false);
  });

  it("allows assignment only from open booths", () => {
    expect(isAssignableBoothStatus("available")).toBe(true);
    expect(isAssignableBoothStatus("reserved")).toBe(true);
    expect(isAssignableBoothStatus("assigned")).toBe(false);
    expect(isAssignableBoothStatus("confirmed")).toBe(false);
    expect(isAssignableBoothStatus("blocked")).toBe(false);
  });

  it("lets an organizer set only the manual statuses", () => {
    expect(isOrganizerSettableBoothStatus("available")).toBe(true);
    expect(isOrganizerSettableBoothStatus("blocked")).toBe(true);
    // assigned/confirmed are only reached through the assignment flow.
    expect(isOrganizerSettableBoothStatus("assigned")).toBe(false);
    expect(isOrganizerSettableBoothStatus("confirmed")).toBe(false);
  });
});

describe("assignment machine", () => {
  it("recognises valid statuses", () => {
    expect(isAssignmentStatus("assigned")).toBe(true);
    expect(isAssignmentStatus("cancelled")).toBe(true);
    expect(isAssignmentStatus("nope")).toBe(false);
  });

  it("walks assigned → confirmed and either → cancelled", () => {
    expect(canTransitionAssignment("assigned", "confirmed")).toBe(true);
    expect(canTransitionAssignment("assigned", "cancelled")).toBe(true);
    expect(canTransitionAssignment("confirmed", "cancelled")).toBe(true);
  });

  it("treats cancelled as terminal and blocks illegal moves", () => {
    expect(canTransitionAssignment("cancelled", "assigned")).toBe(false);
    expect(canTransitionAssignment("confirmed", "assigned")).toBe(false);
    expect(canTransitionAssignment("assigned", "assigned")).toBe(false);
  });

  it("counts everything but cancelled as active (uniqueness)", () => {
    expect(isActiveAssignment("assigned")).toBe(true);
    expect(isActiveAssignment("confirmed")).toBe(true);
    expect(isActiveAssignment("cancelled")).toBe(false);
  });

  it("drives the booth status from the assignment", () => {
    expect(boothStatusForAssignment("assigned")).toBe("assigned");
    expect(boothStatusForAssignment("confirmed")).toBe("confirmed");
    // Cancelling frees the booth.
    expect(boothStatusForAssignment("cancelled")).toBe("available");
  });
});
