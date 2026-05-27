/**
 * Tests for the task predicate compiler.
 *
 * Each test asserts on the emitted OmniJS expression strings — these
 * expressions ultimately run inside the OmniFocus JS engine, so we cannot
 * execute them locally, but we can verify their textual shape and that
 * conditions appear in the expected order.
 */
import { describe, expect, it } from "vitest";
import {
  compileTaskPredicates,
  compileTagPredicates,
  compileProjectPredicates,
  compileFolderPredicates,
} from "../../../src/query/predicates.js";
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

describe("compileTagPredicates", () => {
  describe("empty options", () => {
    it("returns no conditions for empty options", () => {
      const r = compileTagPredicates({});
      expect(r.conditions).toEqual([]);
      expect(r.validationErrors).toEqual([]);
    });
  });

  describe("boolean state predicates", () => {
    it("isRoot: true → (t.parent == null)", () => {
      const r = compileTagPredicates({ isRoot: true });
      expect(r.conditions).toEqual(["(t.parent == null)"]);
    });

    it("isRoot: false → (t.parent != null)", () => {
      const r = compileTagPredicates({ isRoot: false });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("notIsRoot: true → (t.parent != null)", () => {
      const r = compileTagPredicates({ notIsRoot: true });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("hasChildren: true → (t.tags.length > 0)", () => {
      const r = compileTagPredicates({ hasChildren: true });
      expect(r.conditions).toEqual(["(t.tags.length > 0)"]);
    });

    it("noChildren: true → (t.tags.length === 0)", () => {
      const r = compileTagPredicates({ noChildren: true });
      expect(r.conditions).toEqual(["(t.tags.length === 0)"]);
    });

    it("hasNote: true treats empty string as missing", () => {
      const r = compileTagPredicates({ hasNote: true });
      expect(r.conditions[0]).toContain("t.note != null");
      expect(r.conditions[0]).toContain('t.note !== ""');
    });

    it("hasNote: false excludes tags with notes", () => {
      const r = compileTagPredicates({ hasNote: false });
      expect(r.conditions[0]).toContain("t.note == null");
      expect(r.conditions[0]).toContain('t.note === ""');
    });

    it("allowsNextAction: true", () => {
      const r = compileTagPredicates({ allowsNextAction: true });
      expect(r.conditions).toEqual(["(t.allowsNextAction === true)"]);
    });

    it("disallowsNextAction: true", () => {
      const r = compileTagPredicates({ disallowsNextAction: true });
      expect(r.conditions).toEqual(["(t.allowsNextAction === false)"]);
    });

    it("hasAvailableTasks: true → availableTaskCount > 0", () => {
      const r = compileTagPredicates({ hasAvailableTasks: true });
      expect(r.conditions).toEqual(["(t.availableTaskCount > 0)"]);
    });

    it("noAvailableTasks: true → availableTaskCount === 0", () => {
      const r = compileTagPredicates({ noAvailableTasks: true });
      expect(r.conditions).toEqual(["(t.availableTaskCount === 0)"]);
    });
  });

  describe("status predicate", () => {
    it("status: active → Tag.Status.Active", () => {
      const r = compileTagPredicates({ status: "active" });
      expect(r.conditions).toEqual(["(t.status === Tag.Status.Active)"]);
    });

    it("status: on-hold → Tag.Status.OnHold", () => {
      const r = compileTagPredicates({ status: "on-hold" });
      expect(r.conditions).toEqual(["(t.status === Tag.Status.OnHold)"]);
    });

    it("status: dropped → Tag.Status.Dropped", () => {
      const r = compileTagPredicates({ status: "dropped" });
      expect(r.conditions).toEqual(["(t.status === Tag.Status.Dropped)"]);
    });
  });

  describe("parent membership (exact)", () => {
    it("single parent name compiles equality check", () => {
      const r = compileTagPredicates({ parent: "Work" });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain("t.parent != null");
      expect(r.conditions[0]).toContain('t.parent.name === "Work"');
    });

    it("single parent matches by id as well", () => {
      const r = compileTagPredicates({ parent: "abc123" });
      expect(r.conditions[0]).toContain("t.parent.id.primaryKey");
    });

    it("multiple parents use indexOf on both name and id", () => {
      const r = compileTagPredicates({ parent: ["Work", "Personal"] });
      expect(r.conditions[0]).toContain('["Work", "Personal"]');
      expect(r.conditions[0]).toContain("t.parent.name");
      expect(r.conditions[0]).toContain("t.parent.id.primaryKey");
    });

    it("rejects empty parent array", () => {
      const r = compileTagPredicates({ parent: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects parent with quotes", () => {
      const r = compileTagPredicates({ parent: 'bad"name' });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("ancestor membership (transitive)", () => {
    it("single ancestor builds a parent-chain walker IIFE", () => {
      const r = compileTagPredicates({ ancestor: "Contexts" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions).toHaveLength(1);
      // Must be a self-invoking function expression
      expect(r.conditions[0]).toMatch(/^\(function\(\)/);
      // Must walk via p.parent
      expect(r.conditions[0]).toContain("p = p.parent");
      // Must check both name and id
      expect(r.conditions[0]).toContain("p.name");
      expect(r.conditions[0]).toContain("p.id.primaryKey");
      expect(r.conditions[0]).toContain('"Contexts"');
    });

    it("multiple ancestors are collected in a single indexOf array", () => {
      const r = compileTagPredicates({ ancestor: ["Contexts", "Areas"] });
      expect(r.conditions[0]).toContain('["Contexts", "Areas"]');
    });

    it("rejects empty ancestor array", () => {
      const r = compileTagPredicates({ ancestor: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects ancestor with quotes", () => {
      const r = compileTagPredicates({ ancestor: 'bad"name' });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("numeric predicates — availableTaskCount", () => {
    it("availableTaskCountLt", () => {
      const r = compileTagPredicates({ availableTaskCountLt: 5 });
      expect(r.conditions[0]).toBe("(t.availableTaskCount < 5)");
    });

    it("availableTaskCountGt", () => {
      const r = compileTagPredicates({ availableTaskCountGt: 10 });
      expect(r.conditions[0]).toBe("(t.availableTaskCount > 10)");
    });

    it("availableTaskCountEq", () => {
      const r = compileTagPredicates({ availableTaskCountEq: 3 });
      expect(r.conditions[0]).toBe("(t.availableTaskCount === 3)");
    });

    it("rejects NaN for availableTaskCountLt", () => {
      const r = compileTagPredicates({ availableTaskCountLt: Number.NaN });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("numeric predicates — remainingTaskCount", () => {
    it("remainingTaskCountLt", () => {
      const r = compileTagPredicates({ remainingTaskCountLt: 2 });
      expect(r.conditions[0]).toBe("(t.remainingTaskCount < 2)");
    });

    it("remainingTaskCountGt", () => {
      const r = compileTagPredicates({ remainingTaskCountGt: 0 });
      expect(r.conditions[0]).toBe("(t.remainingTaskCount > 0)");
    });
  });

  describe("numeric predicates — childTagCount", () => {
    it("childTagCountLt", () => {
      const r = compileTagPredicates({ childTagCountLt: 3 });
      expect(r.conditions[0]).toBe("(t.tags.length < 3)");
    });

    it("childTagCountGt", () => {
      const r = compileTagPredicates({ childTagCountGt: 0 });
      expect(r.conditions[0]).toBe("(t.tags.length > 0)");
    });
  });

  describe("string matching", () => {
    it("nameContains is case-insensitive by default", () => {
      const r = compileTagPredicates({ nameContains: "Urgent" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
      expect(r.conditions[0]).toContain('"urgent"');
    });

    it("nameContains with caseSensitive: true keeps original case", () => {
      const r = compileTagPredicates({
        nameContains: "Urgent",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain('"Urgent"');
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameStarts checks index 0", () => {
      const r = compileTagPredicates({ nameStarts: "Home" });
      expect(r.conditions[0]).toContain("=== 0");
    });

    it("nameEquals is case-insensitive by default", () => {
      const r = compileTagPredicates({ nameEquals: "Work" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase() ===");
      expect(r.conditions[0]).toContain('"work"');
    });

    it("nameRegex compiles with i flag by default", () => {
      const r = compileTagPredicates({ nameRegex: "^work" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain('new RegExp("^work", "i")');
      expect(r.conditions[0]).toContain(".test(t.name)");
    });

    it("nameRegex rejects invalid pattern", () => {
      const r = compileTagPredicates({ nameRegex: "[" });
      expect(r.validationErrors).toHaveLength(1);
    });

    it("noteContains works against (t.note || '')", () => {
      const r = compileTagPredicates({ noteContains: "TODO" });
      expect(r.conditions[0]).toContain("(t.note || '')");
    });

    it("noteRegex compiles", () => {
      const r = compileTagPredicates({ noteRegex: "\\d+" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain("new RegExp");
    });
  });

  describe("compound queries", () => {
    it("multiple predicates produce conditions in order", () => {
      const r = compileTagPredicates({
        isRoot: true,
        hasAvailableTasks: true,
        nameContains: "work",
      });
      expect(r.conditions.length).toBeGreaterThanOrEqual(3);
      expect(r.conditions[0]).toBe("(t.parent == null)");
    });

    it("collects all validation errors, not just the first", () => {
      const r = compileTagPredicates({
        parent: 'bad"name',
        ancestor: 'also"bad',
        availableTaskCountLt: Number.NaN,
      });
      expect(r.validationErrors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// ─── compileProjectPredicates ─────────────────────────────────────────────────

describe("compileProjectPredicates", () => {
  describe("boolean state", () => {
    it("returns no conditions for empty options", () => {
      const r = compileProjectPredicates({});
      expect(r.conditions).toEqual([]);
      expect(r.validationErrors).toEqual([]);
    });

    it("flagged: true → 't.flagged'", () => {
      const r = compileProjectPredicates({ flagged: true });
      expect(r.conditions).toEqual(["t.flagged"]);
    });

    it("flagged: false → '!t.flagged'", () => {
      const r = compileProjectPredicates({ flagged: false });
      expect(r.conditions).toEqual(["!t.flagged"]);
    });

    it("notFlagged: true → '!t.flagged'", () => {
      const r = compileProjectPredicates({ notFlagged: true });
      expect(r.conditions).toEqual(["!t.flagged"]);
    });

    it("sequential states", () => {
      expect(compileProjectPredicates({ sequential: true }).conditions).toEqual(["t.sequential"]);
      expect(compileProjectPredicates({ sequential: false }).conditions).toEqual(["!t.sequential"]);
      expect(compileProjectPredicates({ notSequential: true }).conditions).toEqual(["!t.sequential"]);
    });

    it("containsSingletonActions states", () => {
      expect(
        compileProjectPredicates({ containsSingletonActions: true }).conditions
      ).toEqual(["t.containsSingletonActions"]);
      expect(
        compileProjectPredicates({ notContainsSingletonActions: true }).conditions
      ).toEqual(["!t.containsSingletonActions"]);
    });

    it("hasDue / noDue predicates", () => {
      expect(compileProjectPredicates({ hasDue: true }).conditions).toEqual([
        "(t.dueDate != null)",
      ]);
      expect(compileProjectPredicates({ hasDue: false }).conditions).toEqual([
        "(t.dueDate == null)",
      ]);
      expect(compileProjectPredicates({ noDue: true }).conditions).toEqual([
        "(t.dueDate == null)",
      ]);
    });

    it("hasDefer", () => {
      expect(compileProjectPredicates({ hasDefer: true }).conditions).toEqual([
        "(t.deferDate != null)",
      ]);
    });

    it("hasNote treats empty string as missing", () => {
      const r = compileProjectPredicates({ hasNote: true });
      expect(r.conditions[0]).toContain("t.note != null");
      expect(r.conditions[0]).toContain('t.note !== ""');
    });

    it("hasNextReview predicates", () => {
      expect(
        compileProjectPredicates({ hasNextReview: true }).conditions
      ).toEqual(["(t.nextReviewDate != null)"]);
      expect(
        compileProjectPredicates({ hasNextReview: false }).conditions
      ).toEqual(["(t.nextReviewDate == null)"]);
    });

    it("dueForReview: true emits nextReviewDate <= new Date()", () => {
      const r = compileProjectPredicates({ dueForReview: true });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain("t.nextReviewDate != null");
      expect(r.conditions[0]).toContain("t.nextReviewDate <= new Date()");
    });

    it("dueForReview: false emits not-due-for-review condition", () => {
      const r = compileProjectPredicates({ dueForReview: false });
      expect(r.conditions[0]).toContain("t.nextReviewDate == null");
      expect(r.conditions[0]).toContain("t.nextReviewDate > new Date()");
    });
  });

  describe("status", () => {
    it("status: active → Project.Status.Active", () => {
      const r = compileProjectPredicates({ status: "active" });
      expect(r.conditions).toEqual(["(t.status === Project.Status.Active)"]);
    });

    it("status: on-hold → Project.Status.OnHold", () => {
      const r = compileProjectPredicates({ status: "on-hold" });
      expect(r.conditions).toEqual(["(t.status === Project.Status.OnHold)"]);
    });

    it("status: completed → Project.Status.Done", () => {
      const r = compileProjectPredicates({ status: "completed" });
      expect(r.conditions).toEqual(["(t.status === Project.Status.Done)"]);
    });

    it("status: dropped → Project.Status.Dropped", () => {
      const r = compileProjectPredicates({ status: "dropped" });
      expect(r.conditions).toEqual(["(t.status === Project.Status.Dropped)"]);
    });
  });

  describe("folder membership (transitive)", () => {
    it("single folder name generates walk expression", () => {
      const r = compileProjectPredicates({ folder: "Work" });
      expect(r.conditions).toHaveLength(1);
      const cond = r.conditions[0] ?? "";
      expect(cond).toContain("t.parentFolder");
      expect(cond).toContain('"Work"');
      // The walk should go up the chain
      expect(cond).toContain("while");
    });

    it("multiple folders generate an array check", () => {
      const r = compileProjectPredicates({ folder: ["Work", "Personal"] });
      expect(r.conditions).toHaveLength(1);
      const cond = r.conditions[0] ?? "";
      expect(cond).toContain('"Work"');
      expect(cond).toContain('"Personal"');
    });

    it("rejects empty folder array", () => {
      const r = compileProjectPredicates({ folder: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(r.conditions).toHaveLength(0);
    });

    it("rejects folder name with quotes", () => {
      const r = compileProjectPredicates({ folder: 'bad"folder' });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.conditions).toHaveLength(0);
    });
  });

  describe("date predicates", () => {
    it("dueBefore emits upper-bound condition", () => {
      const r = compileProjectPredicates({ dueBefore: "2024-12-31T00:00:00.000Z" });
      expect(r.validationErrors).toHaveLength(0);
      expect(r.conditions[0]).toContain("t.dueDate != null");
      expect(r.conditions[0]).toContain("t.dueDate <");
    });

    it("dueAfter emits lower-bound condition", () => {
      const r = compileProjectPredicates({ dueAfter: "2024-01-01T00:00:00.000Z" });
      expect(r.validationErrors).toHaveLength(0);
      expect(r.conditions[0]).toContain("t.dueDate > new Date");
    });

    it("dueWithin '7d' emits bounded check", () => {
      const r = compileProjectPredicates({ dueWithin: "7d" });
      expect(r.validationErrors).toHaveLength(0);
      expect(r.conditions[0]).toContain("t.dueDate >= new Date()");
      expect(r.conditions[0]).toContain("t.dueDate <=");
    });

    it("deferBefore / deferAfter / deferWithin", () => {
      expect(
        compileProjectPredicates({ deferBefore: "2025-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.deferDate != null");
      expect(
        compileProjectPredicates({ deferAfter: "2025-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.deferDate > new Date");
      expect(
        compileProjectPredicates({ deferWithin: "14d" }).conditions[0]
      ).toContain("t.deferDate >= new Date()");
    });

    it("completedBefore / completedAfter", () => {
      expect(
        compileProjectPredicates({ completedBefore: "2025-06-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.completionDate != null");
      expect(
        compileProjectPredicates({ completedAfter: "2025-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.completionDate > new Date");
    });

    it("nextReviewBefore / nextReviewAfter / nextReviewWithin", () => {
      expect(
        compileProjectPredicates({ nextReviewBefore: "2025-03-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.nextReviewDate != null");
      expect(
        compileProjectPredicates({ nextReviewAfter: "2025-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.nextReviewDate > new Date");
      expect(
        compileProjectPredicates({ nextReviewWithin: "30d" }).conditions[0]
      ).toContain("t.nextReviewDate >= new Date()");
    });

    it("lastReviewedBefore / lastReviewedAfter", () => {
      expect(
        compileProjectPredicates({ lastReviewedBefore: "2025-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.lastReviewDate != null");
      expect(
        compileProjectPredicates({ lastReviewedAfter: "2024-01-01T00:00:00.000Z" }).conditions[0]
      ).toContain("t.lastReviewDate > new Date");
    });

    it("rejects invalid date format", () => {
      const r = compileProjectPredicates({ dueBefore: 'bad"date' });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(r.conditions).toHaveLength(0);
    });
  });

  describe("numeric predicates", () => {
    it("taskCountLt / taskCountGt / taskCountEq", () => {
      expect(
        compileProjectPredicates({ taskCountLt: 5 }).conditions[0]
      ).toContain("flattenedTasks.length < 5");
      expect(
        compileProjectPredicates({ taskCountGt: 0 }).conditions[0]
      ).toContain("flattenedTasks.length > 0");
      expect(
        compileProjectPredicates({ taskCountEq: 3 }).conditions[0]
      ).toContain("flattenedTasks.length === 3");
    });

    it("remainingTaskCountLt / remainingTaskCountGt / remainingTaskCountEq", () => {
      const ltCond = compileProjectPredicates({ remainingTaskCountLt: 2 }).conditions[0] ?? "";
      expect(ltCond).toContain("!s.completed");
      expect(ltCond).toContain("< 2");

      const gtCond = compileProjectPredicates({ remainingTaskCountGt: 0 }).conditions[0] ?? "";
      expect(gtCond).toContain("> 0");

      const eqCond = compileProjectPredicates({ remainingTaskCountEq: 1 }).conditions[0] ?? "";
      expect(eqCond).toContain("=== 1");
    });

    it("rejects NaN taskCountLt", () => {
      const r = compileProjectPredicates({ taskCountLt: Number.NaN });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("string matching", () => {
    it("nameContains emits case-insensitive substring check by default", () => {
      const r = compileProjectPredicates({ nameContains: "inbox" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
      expect(r.conditions[0]).toContain('"inbox"');
    });

    it("nameContains with caseSensitive: true", () => {
      const r = compileProjectPredicates({
        nameContains: "Inbox",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain("t.name");
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameStarts emits indexOf === 0 check", () => {
      const r = compileProjectPredicates({ nameStarts: "work" });
      expect(r.conditions[0]).toContain("=== 0");
    });

    it("nameEquals emits case-insensitive equality check by default", () => {
      const r = compileProjectPredicates({ nameEquals: "My Project" });
      // Default is case-insensitive, so the value is lowercased.
      expect(r.conditions[0]).toContain("my project");
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
    });

    it("nameEquals with caseSensitive: true preserves original case", () => {
      const r = compileProjectPredicates({
        nameEquals: "My Project",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain("My Project");
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameRegex compiles correctly", () => {
      const r = compileProjectPredicates({ nameRegex: "^Work.*" });
      expect(r.validationErrors).toHaveLength(0);
      expect(r.conditions[0]).toContain("new RegExp");
      expect(r.conditions[0]).toContain("^Work.*");
    });

    it("noteContains searches note field", () => {
      const r = compileProjectPredicates({ noteContains: "important" });
      expect(r.conditions[0]).toContain("t.note");
      expect(r.conditions[0]).toContain("important");
    });

    it("rejects nameRegex with invalid pattern", () => {
      const r = compileProjectPredicates({ nameRegex: "[invalid" });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects nameContains with quotes", () => {
      const r = compileProjectPredicates({ nameContains: 'bad"value' });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("combined predicates", () => {
    it("status + folder + dueForReview all appear in conditions", () => {
      const r = compileProjectPredicates({
        status: "active",
        folder: "Work",
        dueForReview: true,
      });
      expect(r.validationErrors).toHaveLength(0);
      expect(r.conditions).toHaveLength(3);
      // All three conditions present
      const joined = r.conditions.join(" ");
      expect(joined).toContain("Project.Status.Active");
      expect(joined).toContain("Work");
      expect(joined).toContain("nextReviewDate");
    });
  });
});

describe("compileFolderPredicates", () => {
  describe("empty options", () => {
    it("returns no conditions for empty options", () => {
      const r = compileFolderPredicates({});
      expect(r.conditions).toEqual([]);
      expect(r.validationErrors).toEqual([]);
    });
  });

  describe("boolean state", () => {
    it("isRoot: true → '(t.parent == null)'", () => {
      const r = compileFolderPredicates({ isRoot: true });
      expect(r.conditions).toEqual(["(t.parent == null)"]);
    });

    it("isRoot: false → '(t.parent != null)'", () => {
      const r = compileFolderPredicates({ isRoot: false });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("notIsRoot: true → '(t.parent != null)'", () => {
      const r = compileFolderPredicates({ notIsRoot: true });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("hasProjects: true → projects.length > 0", () => {
      const r = compileFolderPredicates({ hasProjects: true });
      expect(r.conditions).toEqual(["(t.projects.length > 0)"]);
    });

    it("hasProjects: false → projects.length === 0", () => {
      const r = compileFolderPredicates({ hasProjects: false });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("noProjects: true → projects.length === 0", () => {
      const r = compileFolderPredicates({ noProjects: true });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("hasSubfolders: true → folders.length > 0", () => {
      const r = compileFolderPredicates({ hasSubfolders: true });
      expect(r.conditions).toEqual(["(t.folders.length > 0)"]);
    });

    it("noSubfolders: true → folders.length === 0", () => {
      const r = compileFolderPredicates({ noSubfolders: true });
      expect(r.conditions).toEqual(["(t.folders.length === 0)"]);
    });

    it("isEmpty: true → both counts zero", () => {
      const r = compileFolderPredicates({ isEmpty: true });
      expect(r.conditions).toEqual([
        "(t.projects.length === 0 && t.folders.length === 0)",
      ]);
    });

    it("isEmpty: false → at least one non-empty", () => {
      const r = compileFolderPredicates({ isEmpty: false });
      expect(r.conditions).toEqual([
        "(t.projects.length > 0 || t.folders.length > 0)",
      ]);
    });
  });

  describe("status", () => {
    it("status: active → Folder.Status.Active", () => {
      const r = compileFolderPredicates({ status: "active" });
      expect(r.conditions).toEqual(["(t.status === Folder.Status.Active)"]);
    });

    it("status: dropped → not Folder.Status.Active", () => {
      const r = compileFolderPredicates({ status: "dropped" });
      expect(r.conditions).toEqual(["(t.status !== Folder.Status.Active)"]);
    });
  });

  describe("parent membership (exact, non-transitive)", () => {
    it("single parent name matches by name or id", () => {
      const r = compileFolderPredicates({ parent: "Work" });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain("t.parent != null");
      expect(r.conditions[0]).toContain('t.parent.name === "Work"');
      expect(r.conditions[0]).toContain('t.parent.id.primaryKey === "Work"');
    });

    it("multiple parents use indexOf on name and id", () => {
      const r = compileFolderPredicates({ parent: ["Work", "Home"] });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain('["Work", "Home"]');
      expect(r.conditions[0]).toContain("indexOf(t.parent.name)");
      expect(r.conditions[0]).toContain("indexOf(t.parent.id.primaryKey)");
    });

    it("rejects empty array", () => {
      const r = compileFolderPredicates({ parent: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects names with quotes", () => {
      const r = compileFolderPredicates({ parent: 'bad"name' });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("ancestor membership (transitive)", () => {
    it("walks parent chain with an IIFE", () => {
      const r = compileFolderPredicates({ ancestor: "Work" });
      expect(r.conditions).toHaveLength(1);
      const expr = r.conditions[0] ?? "";
      expect(expr).toContain("p = t.parent");
      expect(expr).toContain("p = p.parent");
      expect(expr).toContain('"Work"');
    });

    it("multiple ancestors use an array", () => {
      const r = compileFolderPredicates({ ancestor: ["Work", "Personal"] });
      expect(r.conditions[0]).toContain('["Work", "Personal"]');
    });

    it("rejects empty ancestor array", () => {
      const r = compileFolderPredicates({ ancestor: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("numeric predicates: projectCount", () => {
    it("projectCountLt", () => {
      const r = compileFolderPredicates({ projectCountLt: 3 });
      expect(r.conditions).toEqual(["(t.projects.length < 3)"]);
    });

    it("projectCountGt", () => {
      const r = compileFolderPredicates({ projectCountGt: 5 });
      expect(r.conditions).toEqual(["(t.projects.length > 5)"]);
    });

    it("projectCountEq", () => {
      const r = compileFolderPredicates({ projectCountEq: 0 });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("rejects NaN", () => {
      const r = compileFolderPredicates({ projectCountLt: Number.NaN });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("numeric predicates: flattenedProjectCount", () => {
    it("flattenedProjectCountLt", () => {
      const r = compileFolderPredicates({ flattenedProjectCountLt: 10 });
      expect(r.conditions).toEqual([
        "(t.flattenedProjects.length < 10)",
      ]);
    });

    it("flattenedProjectCountGt", () => {
      const r = compileFolderPredicates({ flattenedProjectCountGt: 2 });
      expect(r.conditions).toEqual([
        "(t.flattenedProjects.length > 2)",
      ]);
    });
  });

  describe("numeric predicates: folderCount", () => {
    it("folderCountLt", () => {
      const r = compileFolderPredicates({ folderCountLt: 4 });
      expect(r.conditions).toEqual(["(t.folders.length < 4)"]);
    });

    it("folderCountGt", () => {
      const r = compileFolderPredicates({ folderCountGt: 0 });
      expect(r.conditions).toEqual(["(t.folders.length > 0)"]);
    });

    it("rejects Infinity", () => {
      const r = compileFolderPredicates({ folderCountGt: Infinity });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("string matching", () => {
    it("nameContains is case-insensitive by default", () => {
      const r = compileFolderPredicates({ nameContains: "Work" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
      expect(r.conditions[0]).toContain('"work"');
    });

    it("nameContains with caseSensitive: true keeps original case", () => {
      const r = compileFolderPredicates({
        nameContains: "Work",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain("t.name.indexOf");
      expect(r.conditions[0]).toContain('"Work"');
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameStarts checks index 0", () => {
      const r = compileFolderPredicates({ nameStarts: "Arc" });
      expect(r.conditions[0]).toContain("=== 0");
    });

    it("nameEquals is case-insensitive by default", () => {
      const r = compileFolderPredicates({ nameEquals: "Work" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase() ===");
      expect(r.conditions[0]).toContain('"work"');
    });

    it("nameRegex compiles with i flag by default", () => {
      const r = compileFolderPredicates({ nameRegex: "^work" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain('new RegExp("^work", "i")');
      expect(r.conditions[0]).toContain(".test(t.name)");
    });

    it("nameRegex rejects invalid pattern", () => {
      const r = compileFolderPredicates({ nameRegex: "[" });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("compound queries", () => {
    it("multiple predicates are AND-combined in order", () => {
      const r = compileFolderPredicates({
        isRoot: true,
        hasProjects: true,
        status: "active",
      });
      expect(r.conditions).toHaveLength(3);
      expect(r.conditions[0]).toBe("(t.parent == null)");
      expect(r.conditions[1]).toBe("(t.projects.length > 0)");
      expect(r.conditions[2]).toBe("(t.status === Folder.Status.Active)");
    });

    it("captures all validation errors, not just the first", () => {
      const r = compileFolderPredicates({
        parent: 'bad"name',
        ancestor: 'also"bad',
        projectCountLt: Number.NaN,
      });
      expect(r.validationErrors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("compileFolderPredicates", () => {
  describe("empty options", () => {
    it("returns no conditions for empty options", () => {
      const r = compileFolderPredicates({});
      expect(r.conditions).toEqual([]);
      expect(r.validationErrors).toEqual([]);
    });
  });

  describe("boolean state", () => {
    it("isRoot: true → '(t.parent == null)'", () => {
      const r = compileFolderPredicates({ isRoot: true });
      expect(r.conditions).toEqual(["(t.parent == null)"]);
    });

    it("isRoot: false → '(t.parent != null)'", () => {
      const r = compileFolderPredicates({ isRoot: false });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("notIsRoot: true → '(t.parent != null)'", () => {
      const r = compileFolderPredicates({ notIsRoot: true });
      expect(r.conditions).toEqual(["(t.parent != null)"]);
    });

    it("hasProjects: true → projects.length > 0", () => {
      const r = compileFolderPredicates({ hasProjects: true });
      expect(r.conditions).toEqual(["(t.projects.length > 0)"]);
    });

    it("hasProjects: false → projects.length === 0", () => {
      const r = compileFolderPredicates({ hasProjects: false });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("noProjects: true → projects.length === 0", () => {
      const r = compileFolderPredicates({ noProjects: true });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("hasSubfolders: true → folders.length > 0", () => {
      const r = compileFolderPredicates({ hasSubfolders: true });
      expect(r.conditions).toEqual(["(t.folders.length > 0)"]);
    });

    it("noSubfolders: true → folders.length === 0", () => {
      const r = compileFolderPredicates({ noSubfolders: true });
      expect(r.conditions).toEqual(["(t.folders.length === 0)"]);
    });

    it("isEmpty: true → both counts zero", () => {
      const r = compileFolderPredicates({ isEmpty: true });
      expect(r.conditions).toEqual([
        "(t.projects.length === 0 && t.folders.length === 0)",
      ]);
    });

    it("isEmpty: false → at least one non-empty", () => {
      const r = compileFolderPredicates({ isEmpty: false });
      expect(r.conditions).toEqual([
        "(t.projects.length > 0 || t.folders.length > 0)",
      ]);
    });
  });

  describe("status", () => {
    it("status: active → Folder.Status.Active", () => {
      const r = compileFolderPredicates({ status: "active" });
      expect(r.conditions).toEqual(["(t.status === Folder.Status.Active)"]);
    });

    it("status: dropped → not Folder.Status.Active", () => {
      const r = compileFolderPredicates({ status: "dropped" });
      expect(r.conditions).toEqual(["(t.status !== Folder.Status.Active)"]);
    });
  });

  describe("parent membership (exact, non-transitive)", () => {
    it("single parent name matches by name or id", () => {
      const r = compileFolderPredicates({ parent: "Work" });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain("t.parent != null");
      expect(r.conditions[0]).toContain('t.parent.name === "Work"');
      expect(r.conditions[0]).toContain('t.parent.id.primaryKey === "Work"');
    });

    it("multiple parents use indexOf on name and id", () => {
      const r = compileFolderPredicates({ parent: ["Work", "Home"] });
      expect(r.conditions).toHaveLength(1);
      expect(r.conditions[0]).toContain('["Work", "Home"]');
      expect(r.conditions[0]).toContain("indexOf(t.parent.name)");
      expect(r.conditions[0]).toContain("indexOf(t.parent.id.primaryKey)");
    });

    it("rejects empty array", () => {
      const r = compileFolderPredicates({ parent: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it("rejects names with quotes", () => {
      const r = compileFolderPredicates({ parent: 'bad"name' });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("ancestor membership (transitive)", () => {
    it("walks parent chain with an IIFE", () => {
      const r = compileFolderPredicates({ ancestor: "Work" });
      expect(r.conditions).toHaveLength(1);
      const expr = r.conditions[0] ?? "";
      expect(expr).toContain("p = t.parent");
      expect(expr).toContain("p = p.parent");
      expect(expr).toContain('"Work"');
    });

    it("multiple ancestors use an array", () => {
      const r = compileFolderPredicates({ ancestor: ["Work", "Personal"] });
      expect(r.conditions[0]).toContain('["Work", "Personal"]');
    });

    it("rejects empty ancestor array", () => {
      const r = compileFolderPredicates({ ancestor: [] });
      expect(r.validationErrors).toHaveLength(1);
      expect(r.validationErrors[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe("numeric predicates: projectCount", () => {
    it("projectCountLt", () => {
      const r = compileFolderPredicates({ projectCountLt: 3 });
      expect(r.conditions).toEqual(["(t.projects.length < 3)"]);
    });

    it("projectCountGt", () => {
      const r = compileFolderPredicates({ projectCountGt: 5 });
      expect(r.conditions).toEqual(["(t.projects.length > 5)"]);
    });

    it("projectCountEq", () => {
      const r = compileFolderPredicates({ projectCountEq: 0 });
      expect(r.conditions).toEqual(["(t.projects.length === 0)"]);
    });

    it("rejects NaN", () => {
      const r = compileFolderPredicates({ projectCountLt: Number.NaN });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("numeric predicates: flattenedProjectCount", () => {
    it("flattenedProjectCountLt", () => {
      const r = compileFolderPredicates({ flattenedProjectCountLt: 10 });
      expect(r.conditions).toEqual([
        "(t.flattenedProjects.length < 10)",
      ]);
    });

    it("flattenedProjectCountGt", () => {
      const r = compileFolderPredicates({ flattenedProjectCountGt: 2 });
      expect(r.conditions).toEqual([
        "(t.flattenedProjects.length > 2)",
      ]);
    });
  });

  describe("numeric predicates: folderCount", () => {
    it("folderCountLt", () => {
      const r = compileFolderPredicates({ folderCountLt: 4 });
      expect(r.conditions).toEqual(["(t.folders.length < 4)"]);
    });

    it("folderCountGt", () => {
      const r = compileFolderPredicates({ folderCountGt: 0 });
      expect(r.conditions).toEqual(["(t.folders.length > 0)"]);
    });

    it("rejects Infinity", () => {
      const r = compileFolderPredicates({ folderCountGt: Infinity });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("string matching", () => {
    it("nameContains is case-insensitive by default", () => {
      const r = compileFolderPredicates({ nameContains: "Work" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase()");
      expect(r.conditions[0]).toContain('"work"');
    });

    it("nameContains with caseSensitive: true keeps original case", () => {
      const r = compileFolderPredicates({
        nameContains: "Work",
        caseSensitive: true,
      });
      expect(r.conditions[0]).toContain("t.name.indexOf");
      expect(r.conditions[0]).toContain('"Work"');
      expect(r.conditions[0]).not.toContain("toLowerCase");
    });

    it("nameStarts checks index 0", () => {
      const r = compileFolderPredicates({ nameStarts: "Arc" });
      expect(r.conditions[0]).toContain("=== 0");
    });

    it("nameEquals is case-insensitive by default", () => {
      const r = compileFolderPredicates({ nameEquals: "Work" });
      expect(r.conditions[0]).toContain("t.name.toLowerCase() ===");
      expect(r.conditions[0]).toContain('"work"');
    });

    it("nameRegex compiles with i flag by default", () => {
      const r = compileFolderPredicates({ nameRegex: "^work" });
      expect(r.validationErrors).toEqual([]);
      expect(r.conditions[0]).toContain('new RegExp("^work", "i")');
      expect(r.conditions[0]).toContain(".test(t.name)");
    });

    it("nameRegex rejects invalid pattern", () => {
      const r = compileFolderPredicates({ nameRegex: "[" });
      expect(r.validationErrors).toHaveLength(1);
    });
  });

  describe("compound queries", () => {
    it("multiple predicates are AND-combined in order", () => {
      const r = compileFolderPredicates({
        isRoot: true,
        hasProjects: true,
        status: "active",
      });
      expect(r.conditions).toHaveLength(3);
      expect(r.conditions[0]).toBe("(t.parent == null)");
      expect(r.conditions[1]).toBe("(t.projects.length > 0)");
      expect(r.conditions[2]).toBe("(t.status === Folder.Status.Active)");
    });

    it("captures all validation errors, not just the first", () => {
      const r = compileFolderPredicates({
        parent: 'bad"name',
        ancestor: 'also"bad',
        projectCountLt: Number.NaN,
      });
      expect(r.validationErrors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
