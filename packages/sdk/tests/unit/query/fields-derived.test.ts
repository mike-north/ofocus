import { describe, it, expect } from "vitest";
import { taskFieldSpec } from "../../../src/query/fields.js";

describe("taskFieldSpec raw-native additions (A3 spec §4)", () => {
  it("exposes taskStatus mapping the native Task.Status enum to lowercase strings", () => {
    const expr = taskFieldSpec.fields.taskStatus?.omnijsExpr;
    expect(expr).toBeDefined();
    expect(expr).toContain("Task.Status");
    for (const v of [
      "available",
      "blocked",
      "next",
      "dueSoon",
      "overdue",
      "completed",
      "dropped",
    ]) {
      expect(expr).toContain(`"${v}"`);
    }
  });
  it("exposes task effectiveDueDate and effectiveDeferDate as ISO-or-null", () => {
    expect(taskFieldSpec.fields.effectiveDueDate?.omnijsExpr).toContain(
      "effectiveDueDate"
    );
    expect(taskFieldSpec.fields.effectiveDeferDate?.omnijsExpr).toContain(
      "effectiveDeferDate"
    );
  });
});
