/**
 * Tests for the pure derived-state transforms.
 *
 * Expected values are hand-derived from the spec, not captured from output.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §5
 */
import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  blockedReason,
  projectHealth,
} from "../../src/derived/compute.js";

describe("effectiveStatus (spec §5.1: actionability only)", () => {
  it("collapses available/next/dueSoon/overdue to 'available'", () => {
    for (const s of ["available", "next", "dueSoon", "overdue"] as const) {
      expect(
        effectiveStatus({
          taskStatus: s,
          effectivelyCompleted: false,
          effectivelyDropped: false,
        })
      ).toBe("available");
    }
  });

  it("maps blocked to 'blocked', and terminal via effectively* flags", () => {
    expect(
      effectiveStatus({
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: false,
      })
    ).toBe("blocked");
    expect(
      effectiveStatus({
        taskStatus: "available",
        effectivelyCompleted: true,
        effectivelyDropped: false,
      })
    ).toBe("completed");
    expect(
      effectiveStatus({
        taskStatus: "available",
        effectivelyCompleted: false,
        effectivelyDropped: true,
      })
    ).toBe("dropped");
  });

  // spec §5.1: effectivelyCompleted takes precedence over native status
  it("effectivelyCompleted overrides any taskStatus", () => {
    expect(
      effectiveStatus({
        taskStatus: "blocked",
        effectivelyCompleted: true,
        effectivelyDropped: false,
      })
    ).toBe("completed");
  });

  // spec §5.1: effectivelyDropped takes precedence (below effectivelyCompleted)
  it("effectivelyDropped overrides blocked taskStatus", () => {
    expect(
      effectiveStatus({
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: true,
      })
    ).toBe("dropped");
  });

  // spec §5.1: native "completed" status without effectively flags
  it("maps native taskStatus 'completed' to 'completed'", () => {
    expect(
      effectiveStatus({
        taskStatus: "completed",
        effectivelyCompleted: false,
        effectivelyDropped: false,
      })
    ).toBe("completed");
  });

  // spec §5.1: native "dropped" status without effectively flags
  it("maps native taskStatus 'dropped' to 'dropped'", () => {
    expect(
      effectiveStatus({
        taskStatus: "dropped",
        effectivelyCompleted: false,
        effectivelyDropped: false,
      })
    ).toBe("dropped");
  });
});

describe("blockedReason (spec §5.3: array ordered by binding precedence)", () => {
  it("orders project-on-hold before sequential-predecessor; [0] is binding", () => {
    const reasons = blockedReason({
      projectStatus: "on-hold",
      projectDeferInFuture: false,
      ownDeferInFuture: false,
      hasIncompleteSequentialPredecessor: true,
      hasIncompleteChildren: false,
    });
    expect(reasons).toEqual(["project-on-hold", "sequential-predecessor"]);
    expect(reasons[0]).toBe("project-on-hold");
  });

  it("returns empty array when nothing blocks", () => {
    expect(
      blockedReason({
        projectStatus: "active",
        projectDeferInFuture: false,
        ownDeferInFuture: false,
        hasIncompleteSequentialPredecessor: false,
        hasIncompleteChildren: false,
      })
    ).toEqual([]);
  });

  // spec §5.3 precedence: project-dropped before incomplete-children (positions 1 vs 7)
  it("project-dropped + incomplete-children → ['project-dropped','incomplete-children']", () => {
    expect(
      blockedReason({
        projectStatus: "dropped",
        projectDeferInFuture: false,
        ownDeferInFuture: false,
        hasIncompleteSequentialPredecessor: false,
        hasIncompleteChildren: true,
      })
    ).toEqual(["project-dropped", "incomplete-children"]);
  });

  // spec §5.3: all reasons simultaneously ordered by precedence array
  it("emits all applicable reasons in precedence order", () => {
    const reasons = blockedReason({
      projectStatus: "on-hold",
      projectDeferInFuture: true,
      ownDeferInFuture: true,
      hasIncompleteSequentialPredecessor: true,
      hasIncompleteChildren: true,
    });
    // project-dropped and project-done are NOT applicable here (status=on-hold)
    expect(reasons).toEqual([
      "project-on-hold",
      "project-deferred",
      "own-defer",
      "sequential-predecessor",
      "incomplete-children",
    ]);
  });

  // spec §5.3: null projectStatus (no project context)
  it("returns empty array when projectStatus is null and no other blocks", () => {
    expect(
      blockedReason({
        projectStatus: null,
        projectDeferInFuture: false,
        ownDeferInFuture: false,
        hasIncompleteSequentialPredecessor: false,
        hasIncompleteChildren: false,
      })
    ).toEqual([]);
  });

  // spec §5.3: project-done (project completed) is distinct from project-dropped
  it("project-done appears at position 2 in precedence (before project-on-hold)", () => {
    const reasons = blockedReason({
      projectStatus: "completed",
      projectDeferInFuture: false,
      ownDeferInFuture: false,
      hasIncompleteSequentialPredecessor: true,
      hasIncompleteChildren: false,
    });
    expect(reasons).toEqual(["project-done", "sequential-predecessor"]);
  });
});

describe("projectHealth (spec §5.4: stalled vs empty)", () => {
  it("active + remaining>=1 + available===0 → stalled", () => {
    expect(
      projectHealth({
        status: "active",
        remainingTaskCount: 3,
        availableTaskCount: 0,
      })
    ).toEqual({ stalled: true, empty: false });
  });

  it("active + remaining===0 → empty (not stalled)", () => {
    expect(
      projectHealth({
        status: "active",
        remainingTaskCount: 0,
        availableTaskCount: 0,
      })
    ).toEqual({ stalled: false, empty: true });
  });

  it("non-active → neither", () => {
    expect(
      projectHealth({
        status: "on-hold",
        remainingTaskCount: 3,
        availableTaskCount: 0,
      })
    ).toEqual({ stalled: false, empty: false });
  });

  // spec §5.4: active project with available tasks → neither stalled nor empty
  it("active + remaining>=1 + available>=1 → neither stalled nor empty", () => {
    expect(
      projectHealth({
        status: "active",
        remainingTaskCount: 3,
        availableTaskCount: 2,
      })
    ).toEqual({ stalled: false, empty: false });
  });

  // spec §5.4: dropped/completed projects are non-active → neither
  it("completed project → neither stalled nor empty", () => {
    expect(
      projectHealth({
        status: "completed",
        remainingTaskCount: 0,
        availableTaskCount: 0,
      })
    ).toEqual({ stalled: false, empty: false });
  });

  it("dropped project → neither stalled nor empty", () => {
    expect(
      projectHealth({
        status: "dropped",
        remainingTaskCount: 5,
        availableTaskCount: 0,
      })
    ).toEqual({ stalled: false, empty: false });
  });
});
