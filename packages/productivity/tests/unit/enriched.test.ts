/**
 * Tests for the pure assembler (`enrichTasks`) and project enrichment
 * (`enrichProjects`) in the wrapping-SDK enriched surface.
 *
 * Expected values are hand-derived from the spec, not captured from output.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §5
 */
import { describe, it, expect } from "vitest";
import { enrichTasks, enrichProjects } from "../../src/commands/enriched.js";
import type { ProjectFacts } from "../../src/commands/enriched.js";
import type { OFProject } from "@ofocus/sdk";

// ── Spec §5: enrichTasks pure assembler ─────────────────────────────────────

describe("enrichTasks (pure assembly over injected raw data)", () => {
  it("computes effectiveStatus, blockedReason, and isNextAction (spec §5)", () => {
    const rawTasks = [
      {
        id: "a",
        name: "first",
        taskStatus: "available",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        deferDate: null,
        effectiveDeferDate: null,
        projectId: "p",
        projectName: "P",
      },
      {
        id: "b",
        name: "second",
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        deferDate: null,
        effectiveDeferDate: null,
        projectId: "p",
        projectName: "P",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "p",
        { status: "active" as const, deferInFuture: false, sequential: true },
      ],
    ]);
    const relational = new Map([
      [
        "a",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
      [
        "b",
        {
          hasIncompleteSequentialPredecessor: true,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.effectiveStatus).toBe("available");
    expect(enriched[0]!.isNextAction).toBe(true);
    expect(enriched[1]!.effectiveStatus).toBe("blocked");
    expect(enriched[1]!.blockedReason).toEqual(["sequential-predecessor"]);
    expect(enriched[1]!.isNextAction).toBe(false);
  });

  // spec §5.3: project-on-hold blocks the task and is the binding reason
  it("project-on-hold task → blockedReason starts with 'project-on-hold' (spec §5.3)", () => {
    const rawTasks = [
      {
        id: "t1",
        name: "task in on-hold project",
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        deferDate: null,
        effectiveDeferDate: null,
        projectId: "ph",
        projectName: "On Hold Project",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "ph",
        { status: "on-hold" as const, deferInFuture: false, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "t1",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.effectiveStatus).toBe("blocked");
    // spec §5.3: project-on-hold is the most binding reason
    expect(enriched[0]!.blockedReason[0]).toBe("project-on-hold");
    expect(enriched[0]!.isNextAction).toBe(false);
  });

  // spec §5: an available task with a defer date in the past stays available
  // with empty blockedReason (blockedReason is only computed when effectiveStatus === "blocked")
  it("available task with past defer date → available with empty blockedReason (spec §5)", () => {
    const rawTasks = [
      {
        id: "t2",
        name: "past-defer available",
        taskStatus: "available",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        // defer date in the past relative to nowIso
        deferDate: "2026-06-07T00:00:00Z",
        effectiveDeferDate: "2026-06-07T00:00:00Z",
        projectId: "active",
        projectName: "Active Project",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "active",
        { status: "active" as const, deferInFuture: false, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "t2",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.effectiveStatus).toBe("available");
    // blockedReason MUST be empty for a non-blocked task
    expect(enriched[0]!.blockedReason).toEqual([]);
    expect(enriched[0]!.isNextAction).toBe(true);
  });

  // Negative: an available task with ownDeferInFuture is still "available"
  // per effectiveStatus (task says available), so blockedReason stays empty.
  it("own-defer-in-future available task → available with empty blockedReason (spec §5)", () => {
    const rawTasks = [
      {
        id: "t3",
        name: "future-defer but labeled available by OF",
        taskStatus: "available",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        // defer date in the future
        deferDate: "2026-06-09T00:00:00Z",
        effectiveDeferDate: "2026-06-09T00:00:00Z",
        projectId: "ap",
        projectName: "Active",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "ap",
        { status: "active" as const, deferInFuture: false, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "t3",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    // effectiveStatus follows taskStatus = available
    expect(enriched[0]!.effectiveStatus).toBe("available");
    // blockedReason only computed for blocked; not-blocked → []
    expect(enriched[0]!.blockedReason).toEqual([]);
  });

  // Regression (Copilot review): a BLOCKED task whose PROJECT is deferred to
  // the future, but which has NO own defer date, must NOT report `own-defer`.
  // `own-defer` is the task's own `deferDate` only; project deferral is
  // `project-deferred` (spec §5.3). Before the fix, `ownDeferInFuture` used the
  // inherited `effectiveDeferDate`, double-counting both reasons.
  it("blocked task in a future-deferred project (no own defer) → ['project-deferred'] only (spec §5.3)", () => {
    const rawTasks = [
      {
        id: "pd",
        name: "blocked by project defer only",
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        deferDate: null, // no OWN defer
        effectiveDeferDate: "2026-06-09T00:00:00Z", // inherited from the project
        projectId: "deferred",
        projectName: "Deferred Project",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "deferred",
        { status: "active" as const, deferInFuture: true, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "pd",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.effectiveStatus).toBe("blocked");
    expect(enriched[0]!.blockedReason).toEqual(["project-deferred"]);
  });

  // Positive companion: a blocked task with its OWN future defer date still
  // reports `own-defer`.
  it("blocked task with its own future defer date → blockedReason includes 'own-defer' (spec §5.3)", () => {
    const rawTasks = [
      {
        id: "od",
        name: "own-deferred",
        taskStatus: "blocked",
        effectivelyCompleted: false,
        effectivelyDropped: false,
        deferDate: "2026-06-09T00:00:00Z", // OWN future defer
        effectiveDeferDate: "2026-06-09T00:00:00Z",
        projectId: "ap",
        projectName: "Active",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "ap",
        { status: "active" as const, deferInFuture: false, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "od",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.blockedReason).toEqual(["own-defer"]);
  });

  // Negative: a completed task should NOT be a next action
  it("completed task → not a next action (spec §5.2)", () => {
    const rawTasks = [
      {
        id: "done",
        name: "done task",
        taskStatus: "completed",
        effectivelyCompleted: true,
        effectivelyDropped: false,
        deferDate: null,
        effectiveDeferDate: null,
        projectId: "p",
        projectName: "P",
      },
    ] as never[];
    const projects = new Map<string, ProjectFacts>([
      [
        "p",
        { status: "active" as const, deferInFuture: false, sequential: false },
      ],
    ]);
    const relational = new Map([
      [
        "done",
        {
          hasIncompleteSequentialPredecessor: false,
          hasIncompleteChildren: false,
        },
      ],
    ]);
    const enriched = enrichTasks(
      rawTasks,
      projects,
      relational,
      "2026-06-08T00:00:00Z"
    );
    expect(enriched[0]!.effectiveStatus).toBe("completed");
    expect(enriched[0]!.blockedReason).toEqual([]);
    expect(enriched[0]!.isNextAction).toBe(false);
  });

  it("returns an empty array for empty input (edge case)", () => {
    expect(
      enrichTasks(
        [],
        new Map<string, ProjectFacts>(),
        new Map<
          string,
          {
            hasIncompleteSequentialPredecessor: boolean;
            hasIncompleteChildren: boolean;
          }
        >(),
        "2026-06-08T00:00:00Z"
      )
    ).toEqual([]);
  });
});

// ── Spec §5.4: enrichProjects pure assembler ─────────────────────────────────

describe("enrichProjects (pure assembly — attaches projectHealth)", () => {
  /** Build a minimal OFProject with overrides. */
  function makeProject(
    overrides: Partial<OFProject> & { availableTaskCount?: number } = {}
  ): OFProject & { availableTaskCount: number } {
    return {
      id: "proj",
      name: "Test Project",
      note: null,
      status: "active",
      sequential: false,
      folderId: null,
      folderName: null,
      taskCount: 3,
      remainingTaskCount: 3,
      availableTaskCount: 2,
      ...overrides,
    };
  }

  it("active project with available tasks → not stalled, not empty (spec §5.4)", () => {
    const result = enrichProjects([
      makeProject({ remainingTaskCount: 3, availableTaskCount: 2 }),
    ]);
    expect(result[0]!.stalled).toBe(false);
    expect(result[0]!.empty).toBe(false);
  });

  it("active project with remaining but no available tasks → stalled (spec §5.4)", () => {
    const result = enrichProjects([
      makeProject({ remainingTaskCount: 3, availableTaskCount: 0 }),
    ]);
    expect(result[0]!.stalled).toBe(true);
    expect(result[0]!.empty).toBe(false);
  });

  it("active project with no remaining tasks → empty (spec §5.4)", () => {
    const result = enrichProjects([
      makeProject({ remainingTaskCount: 0, availableTaskCount: 0 }),
    ]);
    expect(result[0]!.stalled).toBe(false);
    expect(result[0]!.empty).toBe(true);
  });

  it("on-hold project → neither stalled nor empty (spec §5.4)", () => {
    const result = enrichProjects([
      makeProject({
        status: "on-hold",
        remainingTaskCount: 3,
        availableTaskCount: 0,
      }),
    ]);
    expect(result[0]!.stalled).toBe(false);
    expect(result[0]!.empty).toBe(false);
  });
});
