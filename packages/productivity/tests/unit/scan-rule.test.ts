import { describe, it, expect } from "vitest";
import {
  buildRepeatingTasksScript,
  buildTaskRuleScript,
  parseRepeatingTasks,
  parseTaskRuleResult,
} from "../../src/recurrence/scan-rule.js";

describe("buildTaskRuleScript", () => {
  it("references repetitionRule and the three RepetitionMethod constants", () => {
    const s = buildTaskRuleScript("abc123");
    expect(s).toContain("repetitionRule");
    expect(s).toContain("Task.RepetitionMethod.DueDate");
    expect(s).toContain("Task.RepetitionMethod.Start");
    expect(s).toContain("Task.RepetitionMethod.Fixed");
    expect(s).toContain("abc123"); // id spliced safely
    expect(s).toContain("return JSON.stringify");
  });
});

describe("parseTaskRuleResult", () => {
  it("parses a repeating task", () => {
    expect(
      parseTaskRuleResult({
        id: "a",
        name: "Pay rent",
        ruleString: "FREQ=MONTHLY",
        method: "DueDate",
        dueDate: "2026-01-01T09:00:00.000Z",
        deferDate: null,
        completionDate: null,
      })
    ).toEqual({
      id: "a",
      name: "Pay rent",
      ruleString: "FREQ=MONTHLY",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
      deferDate: null,
      completionDate: null,
    });
  });
  it("returns null when the raw result is null (task not found)", () => {
    expect(parseTaskRuleResult(null)).toBeNull();
  });
  it("normalizes a non-repeating task (ruleString/method null)", () => {
    const r = parseTaskRuleResult({
      id: "b",
      name: "One-off",
      ruleString: null,
      method: null,
      dueDate: null,
      deferDate: null,
      completionDate: null,
    });
    expect(r?.ruleString).toBeNull();
    expect(r?.method).toBeNull();
  });
});

describe("buildRepeatingTasksScript", () => {
  it("iterates flattenedTasks and filters on repetitionRule + status", () => {
    const s = buildRepeatingTasksScript();
    expect(s).toContain("flattenedTasks");
    expect(s).toContain("repetitionRule");
    // Mirrors the SDK's incomplete-task predicate (predicates.ts:223).
    expect(s).toContain("Task.Status.Completed");
    expect(s).toContain("Task.Status.Dropped");
    // The three RepetitionMethod constants used to normalize the method.
    expect(s).toContain("Task.RepetitionMethod.DueDate");
    expect(s).toContain("Task.RepetitionMethod.Start");
    expect(s).toContain("Task.RepetitionMethod.Fixed");
    expect(s).toContain("return JSON.stringify");
  });
});

describe("parseRepeatingTasks", () => {
  it("maps an array of rows, normalizing each", () => {
    const rows = parseRepeatingTasks([
      {
        id: "a",
        name: "Weekly review",
        ruleString: "FREQ=WEEKLY;BYDAY=MO",
        method: "DueDate",
        dueDate: "2026-01-01T09:00:00.000Z",
        deferDate: null,
        completionDate: null,
      },
      {
        id: "b",
        name: "Pay rent",
        ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
        method: "Fixed",
        dueDate: null,
        deferDate: "2026-01-01T08:00:00.000Z",
        completionDate: null,
      },
    ]);
    expect(rows).toEqual([
      {
        id: "a",
        name: "Weekly review",
        ruleString: "FREQ=WEEKLY;BYDAY=MO",
        method: "DueDate",
        dueDate: "2026-01-01T09:00:00.000Z",
        deferDate: null,
        completionDate: null,
      },
      {
        id: "b",
        name: "Pay rent",
        ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
        method: "Fixed",
        dueDate: null,
        deferDate: "2026-01-01T08:00:00.000Z",
        completionDate: null,
      },
    ]);
  });

  it("drops malformed entries (missing id/name, non-records)", () => {
    const rows = parseRepeatingTasks([
      { id: "ok", name: "Good", ruleString: null, method: null, dueDate: null, deferDate: null, completionDate: null },
      { id: 42, name: "bad id" }, // non-string id
      { name: "no id" }, // missing id
      null,
      "not a record",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("ok");
  });

  it("returns an empty array for a non-array input", () => {
    expect(parseRepeatingTasks(null)).toEqual([]);
    expect(parseRepeatingTasks({})).toEqual([]);
  });
});
