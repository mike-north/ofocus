/**
 * Tests for `runNextActions` — filters enriched tasks to those where
 * `isNextAction === true` and returns them in a decision-ready shape.
 *
 * Expected values are hand-derived from spec §6, not captured from output.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §6
 */
import { describe, it, expect } from "vitest";
import type { CliOutput, OFTask, QueryResult } from "@ofocus/sdk";
import type { EnrichedTask } from "../../src/derived/types.js";
import {
  runNextActions,
  type NextAction,
  type NextActionsDeps,
} from "../../src/commands/next-actions.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal OFTask extended with enriched fields. */
function makeEnrichedTask(
  overrides: Partial<
    OFTask & {
      isNextAction: boolean;
      effectiveStatus: string;
      taskStatus: string;
      blockedReason: readonly string[];
    }
  > = {}
): EnrichedTask {
  return {
    id: "task",
    name: "Test Task",
    note: null,
    flagged: false,
    completed: false,
    dueDate: null,
    deferDate: null,
    completionDate: null,
    projectId: "proj-1",
    projectName: "Test Project",
    tags: [],
    estimatedMinutes: null,
    taskStatus: "active",
    effectiveStatus: "available",
    blockedReason: [],
    isNextAction: false,
    ...overrides,
  };
}

/** Build a fake `queryTasksEnriched` that returns the provided tasks. */
function makeFakeFetcher(
  tasks: EnrichedTask[]
): NextActionsDeps["queryTasksEnriched"] {
  return async () => ({
    success: true,
    data: {
      kind: "list" as const,
      items: tasks,
      totalCount: tasks.length,
      returnedCount: tasks.length,
      hasMore: false,
      offset: 0,
      limit: 100,
    },
    error: null,
  });
}

/** Build a fake `queryTasksEnriched` that returns a failure. */
function makeFailingFetcher(): NextActionsDeps["queryTasksEnriched"] {
  return async () => ({
    success: false,
    data: null,
    error: {
      code: "UNKNOWN_ERROR" as const,
      message: "fetch failed",
    },
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NEXT_ACTION_PROJ_A = makeEnrichedTask({
  id: "na-a-1",
  name: "First task in Project A",
  projectId: "proj-a",
  projectName: "Project Alpha",
  dueDate: "2026-07-01T00:00:00.000Z",
  isNextAction: true,
  effectiveStatus: "available",
});

const NON_NEXT_ACTION_PROJ_A = makeEnrichedTask({
  id: "na-a-2",
  name: "Second task in Project A",
  projectId: "proj-a",
  projectName: "Project Alpha",
  isNextAction: false,
  effectiveStatus: "available",
});

const NEXT_ACTION_PROJ_B = makeEnrichedTask({
  id: "na-b-1",
  name: "First task in Project B",
  projectId: "proj-b",
  projectName: "Project Beta",
  isNextAction: true,
  effectiveStatus: "available",
});

const BLOCKED_TASK_PROJ_B = makeEnrichedTask({
  id: "na-b-2",
  name: "Blocked task in Project B",
  projectId: "proj-b",
  projectName: "Project Beta",
  isNextAction: false,
  effectiveStatus: "blocked",
  blockedReason: ["sequential-predecessor"],
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("runNextActions", () => {
  it("returns only isNextAction tasks, filtered from a mixed set (spec §6)", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([
        NEXT_ACTION_PROJ_A,
        NON_NEXT_ACTION_PROJ_A,
        NEXT_ACTION_PROJ_B,
        BLOCKED_TASK_PROJ_B,
      ]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    // spec §6: one next action per project — two projects → two results
    expect(result.data!.count).toBe(2);
    expect(result.data!.actions).toHaveLength(2);
  });

  it("maps next actions to a decision-ready NextAction shape (spec §6)", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([NEXT_ACTION_PROJ_A]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    const action = result.data!.actions[0] as NextAction;
    // spec §6: decision-ready shape includes id, name, projectId, projectName, dueDate
    expect(action.id).toBe("na-a-1");
    expect(action.name).toBe("First task in Project A");
    expect(action.projectId).toBe("proj-a");
    expect(action.projectName).toBe("Project Alpha");
    expect(action.dueDate).toBe("2026-07-01T00:00:00.000Z");
  });

  it("returns a CliOutput success envelope (spec §6)", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([NEXT_ACTION_PROJ_A]),
    };

    const output: CliOutput<{ actions: NextAction[]; count: number }> =
      await runNextActions(deps);

    expect(output.success).toBe(true);
    expect(output.error).toBeNull();
    expect(output.data).not.toBeNull();
  });

  it("returns an empty list when no tasks are next actions", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([
        NON_NEXT_ACTION_PROJ_A,
        BLOCKED_TASK_PROJ_B,
      ]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    expect(result.data!.count).toBe(0);
    expect(result.data!.actions).toHaveLength(0);
  });

  it("returns an empty list when the input is empty", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    expect(result.data!.count).toBe(0);
    expect(result.data!.actions).toHaveLength(0);
  });

  it("propagates a fetcher failure as a CliOutput failure", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFailingFetcher(),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("excludes non-next-action tasks (isNextAction: false) from the result", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([NON_NEXT_ACTION_PROJ_A]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    expect(result.data!.actions).toHaveLength(0);
  });

  it("excludes blocked tasks even when they appear in the input", async () => {
    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([BLOCKED_TASK_PROJ_B]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    expect(result.data!.actions).toHaveLength(0);
  });

  it("includes dueDate as null when task has no due date", async () => {
    const noDueTask = makeEnrichedTask({
      id: "no-due",
      name: "No Due Date Task",
      projectId: "proj-c",
      projectName: "Project C",
      dueDate: null,
      isNextAction: true,
    });

    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([noDueTask]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    const action = result.data!.actions[0] as NextAction;
    expect(action.dueDate).toBeNull();
  });

  it("includes projectId as null for inbox tasks", async () => {
    const inboxTask = makeEnrichedTask({
      id: "inbox-1",
      name: "Inbox Task",
      projectId: null,
      projectName: null,
      isNextAction: true,
      effectiveStatus: "available",
    });

    const deps: NextActionsDeps = {
      queryTasksEnriched: makeFakeFetcher([inboxTask]),
    };

    const result = await runNextActions(deps);

    expect(result.success).toBe(true);
    const action = result.data!.actions[0] as NextAction;
    expect(action.projectId).toBeNull();
    expect(action.projectName).toBeNull();
  });
});
