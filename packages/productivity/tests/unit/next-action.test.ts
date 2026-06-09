/**
 * Tests for structural next-action marking.
 *
 * Expected values are hand-derived from the spec, not captured from output.
 *
 * @see docs/specs/2026-06-08-ofocus-derived-state-design.md §5.2
 */
import { describe, it, expect } from "vitest";
import { markNextActions } from "../../src/derived/next-action.js";

describe("markNextActions (spec §5.2: first available per project)", () => {
  it("marks the first available task per project as the next action (spec §5.2)", () => {
    const tasks = [
      { id: "a", projectId: "p", effectiveStatus: "available" },
      { id: "b", projectId: "p", effectiveStatus: "available" },
      { id: "c", projectId: "q", effectiveStatus: "blocked" },
      { id: "d", projectId: "q", effectiveStatus: "available" },
    ] as never[];
    const flags = markNextActions(tasks);
    expect(flags).toEqual({ a: true, b: false, c: false, d: true });
  });

  it("an overdue/due-soon first action still counts (it is 'available')", () => {
    const tasks = [
      { id: "x", projectId: "p", effectiveStatus: "available" },
    ] as never[];
    expect(markNextActions(tasks)).toEqual({ x: true });
  });

  // spec §5.2: two projects each get exactly one next action
  it("two projects each get exactly one next action", () => {
    const tasks = [
      { id: "a1", projectId: "alpha", effectiveStatus: "available" },
      { id: "a2", projectId: "alpha", effectiveStatus: "available" },
      { id: "b1", projectId: "beta", effectiveStatus: "available" },
      { id: "b2", projectId: "beta", effectiveStatus: "blocked" },
    ] as never[];
    const flags = markNextActions(tasks);
    expect(flags).toEqual({ a1: true, a2: false, b1: true, b2: false });
  });

  // spec §5.2: null projectId is treated as an inbox bucket of its own
  it("inbox tasks (projectId null) are treated as their own bucket", () => {
    const tasks = [
      { id: "i1", projectId: null, effectiveStatus: "available" },
      { id: "i2", projectId: null, effectiveStatus: "available" },
      { id: "p1", projectId: "proj", effectiveStatus: "available" },
    ] as never[];
    const flags = markNextActions(tasks);
    // i1 is the first available inbox task → next action; i2 is not
    // p1 is the first available task in "proj" → next action
    expect(flags).toEqual({ i1: true, i2: false, p1: true });
  });

  // spec §5.2: blocked task first, then available — only available one is the next action
  it("skips non-available tasks when finding the first per project", () => {
    const tasks = [
      { id: "t1", projectId: "p", effectiveStatus: "blocked" },
      { id: "t2", projectId: "p", effectiveStatus: "completed" },
      { id: "t3", projectId: "p", effectiveStatus: "available" },
    ] as never[];
    const flags = markNextActions(tasks);
    expect(flags).toEqual({ t1: false, t2: false, t3: true });
  });

  // spec §5.2: no available tasks in a project → no next action flagged
  it("no available tasks → no next action for that project", () => {
    const tasks = [
      { id: "t1", projectId: "p", effectiveStatus: "blocked" },
      { id: "t2", projectId: "p", effectiveStatus: "completed" },
    ] as never[];
    const flags = markNextActions(tasks);
    expect(flags).toEqual({ t1: false, t2: false });
  });

  it("returns empty object for an empty input array", () => {
    expect(markNextActions([])).toEqual({});
  });
});
