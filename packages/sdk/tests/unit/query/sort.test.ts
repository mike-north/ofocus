import { describe, expect, it } from "vitest";
import { compileSort } from "../../../src/query/sort.js";
import { taskFieldSpec } from "../../../src/query/fields.js";
import { ErrorCode } from "../../../src/errors.js";

describe("compileSort", () => {
  it("returns null comparator when no sort keys", () => {
    const r = compileSort(taskFieldSpec, {});
    expect(r.comparator).toBeNull();
    expect(r.validationErrors).toEqual([]);
  });

  it("returns null comparator when sort is empty array", () => {
    const r = compileSort(taskFieldSpec, { sort: [] });
    expect(r.comparator).toBeNull();
  });

  it("single-key sort produces a function(a, b)", () => {
    const r = compileSort(taskFieldSpec, { sort: ["name"] });
    expect(r.comparator).not.toBeNull();
    expect(r.comparator).toContain("function(a, b)");
  });

  it("multi-key sort emits multiple comparison blocks", () => {
    const r = compileSort(taskFieldSpec, { sort: ["dueDate", "name"] });
    expect(r.comparator).not.toBeNull();
    // Should reference both getters with `a.` / `b.` variants.
    expect(r.comparator).toContain("a.dueDate");
    expect(r.comparator).toContain("b.dueDate");
    expect(r.comparator).toContain("a.name");
    expect(r.comparator).toContain("b.name");
  });

  it("reverse: true wraps the base comparator", () => {
    const r = compileSort(taskFieldSpec, { sort: ["name"], reverse: true });
    expect(r.comparator).toContain("return -base(a, b)");
  });

  it("nulls sort last by default", () => {
    const r = compileSort(taskFieldSpec, { sort: ["dueDate"] });
    // Null on a, non-null on b → return 1 (a goes after).
    expect(r.comparator).toMatch(/aNull[\s\S]*return 1/);
  });

  it("nullsFirst: true flips null ordering", () => {
    const r = compileSort(taskFieldSpec, {
      sort: ["dueDate"],
      nullsFirst: true,
    });
    expect(r.comparator).toMatch(/aNull[\s\S]*return -1/);
  });

  it("rejects unknown sort key with VALIDATION_ERROR", () => {
    const r = compileSort(taskFieldSpec, { sort: ["bogusKey"] });
    expect(r.validationErrors).toHaveLength(1);
    expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(r.comparator).toBeNull();
  });

  it("mixes valid and invalid keys: emits comparator for valid ones, errors for invalid", () => {
    const r = compileSort(taskFieldSpec, { sort: ["name", "bogus"] });
    expect(r.validationErrors).toHaveLength(1);
    expect(r.comparator).not.toBeNull();
    expect(r.comparator).toContain("a.name");
    expect(r.comparator).not.toContain("a.bogus");
  });

  it("variable rebinding uses word boundaries (no over-matching on identifier suffixes)", () => {
    // The `tags` field expression contains the substring `tg.name`. The
    // rebinder must not also rewrite `tg.` because the original `t` is a
    // word-bounded identifier. Verify on a field whose getter starts with
    // `t.` but also contains a function whose param uses `tg`.
    const r = compileSort(taskFieldSpec, { sort: ["tags"] });
    expect(r.comparator).toContain("a.tags");
    // tg inside the inner function should be untouched.
    expect(r.comparator).toContain("tg.name");
  });
});
