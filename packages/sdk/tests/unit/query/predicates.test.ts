/**
 * Tests for the task predicate compiler.
 *
 * Each test asserts on the emitted OmniJS expression strings — these
 * expressions ultimately run inside the OmniFocus JS engine, so we cannot
 * execute them locally, but we can verify their textual shape and that
 * conditions appear in the expected order.
 */
import { describe, expect, it } from "vitest";
import { compileTaskPredicates } from "../../../src/query/predicates.js";
import { ErrorCode } from "../../../src/errors.js";

describe("compileTaskPredicates", () => {
  describe("boolean state", () => {
    it("returns no conditions for empty options", () => {
      const r = compileTaskPredicates({});
      expect(r.conditions).toEqual([]);
      expect(r.validationErrors).toEqual([]);
    });

    it("flagged: true → 't.flagged'", () => {
      const r = compileTaskPredicates({ flagged: true });
      expect(r.conditions).toEqual(["t.flagged"]);
    });

    it("flagged: false → '!t.flagged'", () => {
      const r = compileTaskPredicates({ flagged: false });
      expect(r.conditions).toEqual(["!t.flagged"]);
    });

    it("notFlagged: true → '!t.flagged'", () => {
      const r = compileTaskPredicates({ notFlagged: true });
      expect(r.conditions).toEqual(["!t.flagged"]);
    });

    it("completed states", () => {
      expect(compileTaskPredicates({ completed: true }).conditions).toEqual([
        "t.completed",
      ]);
      expect(compileTaskPredicates({ completed: false }).conditions).toEqual([
        "!t.completed",
      ]);
      expect(compileTaskPredicates({ notCompleted: true }).conditions).toEqual([
        "!t.completed",
      ]);
    });

    it("dropped states", () => {
      expect(compileTaskPredicates({ dropped: true }).conditions).toEqual([
        "t.dropped",
      ]);
      expect(compileTaskPredicates({ notDropped: true }).conditions).toEqual([
        "!t.dropped",
      ]);
    });

    it("blocked state", () => {
      expect(compileTaskPredicates({ blocked: true }).conditions).toEqual([
        "t.blocked",
      ]);
    });

    it("available: true compiles three-way condition", () => {
      const r = compileTaskPredicates({ available: true });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain("!t.completed");
      expect(r.conditions[0]).toContain("!t.effectivelyDropped");
      expect(r.conditions[0]).toContain("!t.blocked");
    });

    it("inInbox states", () => {
      expect(compileTaskPredicates({ inInbox: true }).conditions).toEqual([
        "(t.containingProject == null)",
      ]);
      expect(compileTaskPredicates({ inInbox: false }).conditions).toEqual([
        "(t.containingProject != null)",
      ]);
    });

    it("date-presence predicates", () => {
      expect(compileTaskPredicates({ hasDue: true }).conditions).toEqual([
        "(t.dueDate != null)",
      ]);
      expect(compileTaskPredicates({ noDue: true }).conditions).toEqual([
        "(t.dueDate == null)",
      ]);
      expect(compileTaskPredicates({ hasDefer: true }).conditions).toEqual([
        "(t.deferDate != null)",
      ]);
    });

    it("hasNote treats empty string as missing", () => {
      const r = compileTaskPredicates({ hasNote: true });
      expect(r.conditions[0]).toContain("t.note != null");
      expect(r.conditions[0]).toContain('t.note !== ""');
    });

    it("hasAttachments, hasSubtasks, hasRepetition", () => {
      expect(
        compileTaskPredicates({ hasAttachments: true }).conditions
      ).toEqual(["(t.attachments.length > 0)"]);
      expect(compileTaskPredicates({ hasSubtasks: true }).conditions).toEqual([
        "(t.children.length > 0)",
      ]);
      expect(
        compileTaskPredicates({ hasRepetition: true }).conditions
      ).toEqual(["(t.repetitionRule != null)"]);
    });

    it("effective flags", () => {
      expect(
        compileTaskPredicates({ effectivelyCompleted: true }).conditions
      ).toEqual(["t.effectivelyCompleted"]);
      expect(
        compileTaskPredicates({ effectivelyDropped: true }).conditions
      ).toEqual(["t.effectivelyDropped"]);
    });
  });

  describe("status convenience", () => {
    it("status: active", () => {
      const r = compileTaskPredicates({ status: "active" });
      expect(r.conditions).toEqual(["(!t.completed && !t.dropped)"]);
    });

    it("status: completed → t.completed", () => {
      const r = compileTaskPredicates({ status: "completed" });
      expect(r.conditions).toEqual(["t.completed"]);
    });

    it("status: dropped", () => {
      const r = compileTaskPredicates({ status: "dropped" });
      expect(r.conditions).toEqual(["t.dropped"]);
    });

    it("status: deferred (defer date in future)", () => {
      const r = compileTaskPredicates({ status: "deferred" });
      expect(r.conditions[0]).toContain("t.deferDate != null");
      expect(r.conditions[0]).toContain("t.deferDate > new Date()");
    });
  });

  describe("project membership", () => {
    it("single project name", () => {
      const r = compileTaskPredicates({ project: "Work" });
      expect(r.conditions).toEqual([
        '(t.containingProject != null && t.containingProject.name === "Work")',
      ]);
    });

    it("multiple projects → indexOf check", () => {
      const r = compileTaskPredicates({ project: ["Work", "Home"] });
      expect(r.conditions[0]).toContain('["Work", "Home"]');
      expect(r.conditions[0]).toContain("indexOf(t.containingProject.name)");
    });

    it("rejects empty array", () => {
      const r = compileTaskPredicates({ project: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects names with quotes", () => {
      const r = compileTaskPredicates({ project: 'bad"name' });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("rejects names with backslashes", () => {
      const r = compileTaskPredicates({ project: "bad\\name" });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("tag membership", () => {
    it("single tag defaults to 'all' semantics", () => {
      const r = compileTaskPredicates({ tag: "Urgent" });
      expect(r.conditions[0]).toContain('["Urgent"]');
      expect(r.conditions[0]).toContain(".every");
    });

    it("tag: array with tagMode 'any'", () => {
      const r = compileTaskPredicates({
        tag: ["Work", "Home"],
        tagMode: "any",
      });
      expect(r.conditions[0]).toContain(".some");
      expect(r.conditions[0]).toContain('["Work", "Home"]');
    });

    it("tag: array with tagMode 'none'", () => {
      const r = compileTaskPredicates({ tag: "Urgent", tagMode: "none" });
      expect(r.conditions[0]).toMatch(/^!\[/);
    });

    it("default tagMode is 'all'", () => {
      const r = compileTaskPredicates({ tag: ["A", "B"] });
      expect(r.conditions[0]).toContain(".every");
    });

    it("rejects empty tag array", () => {
      const r = compileTaskPredicates({ tag: [] });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("folder membership (transitive)", () => {
    it("walks parentFolder chain", () => {
      const r = compileTaskPredicates({ folder: "Projects" });
      expect(r.conditions[0]).toContain("parentFolder");
      expect(r.conditions[0]).toContain("f.parent");
      expect(r.conditions[0]).toContain('["Projects"]');
    });

    it("handles multiple folders", () => {
      const r = compileTaskPredicates({ folder: ["A", "B"] });
      expect(r.conditions[0]).toContain('["A", "B"]');
    });
  });

  describe("date predicates", () => {
    it("dueBefore with ISO date", () => {
      const r = compileTaskPredicates({ dueBefore: "2026-06-01" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain("t.dueDate != null");
      expect(r.conditions[0]).toContain("t.dueDate <");
      expect(r.conditions[0]).toContain('new Date("2026-06-01T00:00:00.000Z")');
    });

    it("dueAfter with relative date", () => {
      const r = compileTaskPredicates({ dueAfter: "today" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain("t.dueDate >");
    });

    it("dueOn compiles a half-open interval", () => {
      const r = compileTaskPredicates({ dueOn: "2026-05-30" });
      expect(r.conditions[0]).toContain("t.dueDate >=");
      expect(r.conditions[0]).toContain("t.dueDate <");
    });

    it("dueWithin uses a duration", () => {
      const r = compileTaskPredicates({ dueWithin: "7d" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain("t.dueDate >= new Date()");
      expect(r.conditions[0]).toContain("t.dueDate <=");
    });

    it("dueWithin rejects bad duration", () => {
      const r = compileTaskPredicates({ dueWithin: "garbage" });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("dueBefore rejects malformed input", () => {
      const r = compileTaskPredicates({ dueBefore: "not-a-date" });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("defer date trio", () => {
      const before = compileTaskPredicates({ deferBefore: "2026-06-01" });
      const after = compileTaskPredicates({ deferAfter: "2026-06-01" });
      const within = compileTaskPredicates({ deferWithin: "3d" });
      expect(before.conditions[0]).toContain("t.deferDate <");
      expect(after.conditions[0]).toContain("t.deferDate >");
      expect(within.conditions[0]).toContain("t.deferDate >=");
    });

    it("completion date predicates", () => {
      const before = compileTaskPredicates({ completedBefore: "2026-01-01" });
      const after = compileTaskPredicates({ completedAfter: "2026-01-01" });
      expect(before.conditions[0]).toContain("t.completionDate <");
      expect(after.conditions[0]).toContain("t.completionDate >");
    });
  });

  describe("numeric predicates", () => {
    it("estimateLt", () => {
      const r = compileTaskPredicates({ estimateLt: 30 });
      expect(r.conditions[0]).toContain("t.estimatedMinutes != null");
      expect(r.conditions[0]).toContain("t.estimatedMinutes < 30");
    });

    it("estimateGt", () => {
      const r = compileTaskPredicates({ estimateGt: 5 });
      expect(r.conditions[0]).toContain("t.estimatedMinutes > 5");
    });

    it("estimateEq", () => {
      const r = compileTaskPredicates({ estimateEq: 15 });
      expect(r.conditions[0]).toContain("t.estimatedMinutes === 15");
    });

    it("estimateBetween emits inclusive range", () => {
      const r = compileTaskPredicates({ estimateBetween: [5, 30] });
      expect(r.conditions[0]).toContain("t.estimatedMinutes >= 5");
      expect(r.conditions[0]).toContain("t.estimatedMinutes <= 30");
    });

    it("estimateBetween rejects reversed range", () => {
      const r = compileTaskPredicates({ estimateBetween: [30, 5] });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("rejects NaN values", () => {
      const r = compileTaskPredicates({ estimateLt: Number.NaN });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("string matching", () => {
    it("nameContains is case-insensitive by default", () => {
      const r = compileTaskPredicates({ nameContains: "Foo" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
      expect(r.conditions[0]).toContain('"foo"');
    });

    it("nameContains with caseSensitive: true keeps original case", () => {
      const r = compileTaskPredicates({
        nameContains: "Foo",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain("t.name.indexOf");
      expect(r.conditions[0]).toContain('"Foo"');
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameStarts checks index 0", () => {
      const r = compileTaskPredicates({ nameStarts: "Re:" });
      expect(r.conditions[0]).toContain("=== 0");
    });

    it("nameEquals is case-insensitive by default", () => {
      const r = compileTaskPredicates({ nameEquals: "Inbox" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase() ===");
      expect(r.conditions[0]).toContain('"inbox"');
    });

    it("nameRegex compiles with i flag by default", () => {
      const r = compileTaskPredicates({ nameRegex: "^foo" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain('new RegExp("^foo", "i")');
      expect(r.conditions[0]).toContain(".test(t.name)");
    });

    it("nameRegex rejects invalid pattern", () => {
      const r = compileTaskPredicates({ nameRegex: "[" });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("noteContains works against (t.note || '')", () => {
      const r = compileTaskPredicates({ noteContains: "TODO" });
      expect(r.conditions[0]).toContain("(t.note || '')");
    });

    it("noteRegex compiles", () => {
      const r = compileTaskPredicates({ noteRegex: "\\d+" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain("new RegExp");
    });
  });

  describe("compound queries", () => {
    it("multiple predicates produce multiple conditions in order", () => {
      const r = compileTaskPredicates({
        flagged: true,
        dueBefore: "2026-06-01",
        tag: "Urgent",
      });
      expect(r.conditions.length).toBeGreaterThanOrEqual(3);
      expect(r.conditions[0]).toBe("t.flagged");
    });

    it("captures all validation errors, not just the first", () => {
      const r = compileTaskPredicates({
        project: 'bad"name',
        tag: 'also"bad',
        dueBefore: "not-a-date",
      });
      expect(r.validationErrors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
