/**
 * Tests for building/parsing the task-state OmniJS read. The live read is
 * exercised in the UAT; here we test the pure script-builder and parser.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.5
 */
import { describe, expect, it } from "vitest";
import {
  buildTaskStateScript,
  parseTaskStates,
} from "../../src/links/scan-task-state.js";

describe("buildTaskStateScript", () => {
  it("embeds each escaped id and returns a stringified array", () => {
    const body = buildTaskStateScript(["abc", 'we"ird']);
    expect(body).toContain('"abc"');
    expect(body).toContain('we\\"ird'); // escaped quote
    expect(body).toContain("Task.byIdentifier");
    expect(body).toContain("JSON.stringify(rows)");
  });
});

describe("parseTaskStates", () => {
  it("maps valid rows to TaskState", () => {
    const rows = [
      {
        taskId: "t1",
        name: "Draft agenda",
        completed: false,
        estimatedMinutes: 30,
        dueDate: "2026-06-02T14:00:00.000Z",
      },
    ];
    expect(parseTaskStates(rows)).toEqual([
      {
        taskId: "t1",
        name: "Draft agenda",
        completed: false,
        estimatedMinutes: 30,
        dueDate: "2026-06-02T14:00:00.000Z",
      },
    ]);
  });

  it("coerces missing estimate/due to null", () => {
    const rows = [
      { taskId: "t1", name: "X", completed: true, estimatedMinutes: null, dueDate: null },
    ];
    const [s] = parseTaskStates(rows);
    expect(s!.estimatedMinutes).toBeNull();
    expect(s!.dueDate).toBeNull();
    expect(s!.completed).toBe(true);
  });

  it("non-array → empty", () => {
    expect(parseTaskStates(null)).toEqual([]);
    expect(parseTaskStates({})).toEqual([]);
  });

  it("skips malformed rows", () => {
    const rows = [{ taskId: "t1", name: "ok", completed: false, estimatedMinutes: 5, dueDate: null }, 42, { nope: true }];
    expect(parseTaskStates(rows)).toHaveLength(1);
  });
});
