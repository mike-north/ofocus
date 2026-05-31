import { describe, it, expect } from "vitest";
import {
  buildTaskRuleScript,
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
