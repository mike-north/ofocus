/**
 * Tests for the `next-occurrences` command.
 *
 * Verifies that a task's repetition rule is read, parsed, and expanded into
 * its next occurrence dates. Dependencies (`readTaskRule`, `now`) are injected
 * so the suite never touches a live OmniFocus instance.
 *
 * Recurrence semantics follow RFC 5545 §3.3.10 (RRULE).
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { describe, expect, it } from "vitest";
import type { TaskRule } from "../../src/recurrence/scan-rule.js";
import { runNextOccurrences } from "../../src/commands/next-occurrences.js";

/**
 * Build a {@link TaskRule} with sensible defaults; override per-test.
 * Extracted to keep each test focused on the fields that matter to it.
 */
function makeRule(overrides: Partial<TaskRule> = {}): TaskRule {
  return {
    id: "a",
    name: "Untitled",
    ruleString: null,
    method: null,
    dueDate: null,
    deferDate: null,
    completionDate: null,
    ...overrides,
  };
}

/** A `readTaskRule` stub that always resolves to the given rule (or null). */
function stubReader(rule: TaskRule | null): (id: string) => Promise<TaskRule | null> {
  return () => Promise.resolve(rule);
}

describe("runNextOccurrences", () => {
  it("returns predictable monthly occurrences after now for a DueDate repeat", async () => {
    const rule = makeRule({
      id: "a",
      name: "Pay rent",
      ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "a", count: 2 },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeating).toBe(true);
    expect(out.data.predictable).toBe(true);
    expect(out.data.repeatMethod).toBe("due-again");
    expect(out.data.method).toBe("DueDate");
    expect(out.data.anchor).toBe("2026-01-01T09:00:00.000Z");
    // Occurrences strictly after now (2026-01-15): Feb 1 and Mar 1, 09:00 UTC.
    expect(out.data.occurrences).toEqual([
      "2026-02-01T09:00:00.000Z",
      "2026-03-01T09:00:00.000Z",
    ]);
    // A predictable (schedule-anchored) repeat carries no projection note.
    expect(out.data.note).toBeUndefined();
  });

  it("maps a Fixed repeat to the 'scheduled' method and stays predictable", async () => {
    const rule = makeRule({
      id: "f",
      name: "Quarterly review",
      ruleString: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1",
      method: "Fixed",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "f", count: 2 },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeatMethod).toBe("scheduled");
    expect(out.data.predictable).toBe(true);
    // Every 3 months from Jan 1: Apr 1, Jul 1 (strictly after Jan 15).
    expect(out.data.occurrences).toEqual([
      "2026-04-01T09:00:00.000Z",
      "2026-07-01T09:00:00.000Z",
    ]);
  });

  it("marks a Start (completion-anchored) repeat as not predictable and projects with a note", async () => {
    const rule = makeRule({
      id: "s",
      name: "Water plants",
      ruleString: "FREQ=DAILY;INTERVAL=3",
      method: "Start",
      // Start repeats are completion-anchored; the due/defer grid does not drive them.
      deferDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "s", count: 2 },
      { readTaskRule: stubReader(rule), now: "2026-01-15T08:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeatMethod).toBe("defer-another");
    expect(out.data.method).toBe("Start");
    expect(out.data.predictable).toBe(false);
    expect(out.data.note).toBeDefined();
    // Start anchors from `from ?? completionDate ?? now`; here that is `now`.
    expect(out.data.anchor).toBe("2026-01-15T08:00:00.000Z");
    // Every 3 days strictly after the now-anchor: Jan 18 and Jan 21, 08:00 UTC.
    expect(out.data.occurrences).toEqual([
      "2026-01-18T08:00:00.000Z",
      "2026-01-21T08:00:00.000Z",
    ]);
  });

  it("anchors a Start repeat from completionDate when no `from` is given", async () => {
    const rule = makeRule({
      id: "s2",
      name: "Take out trash",
      ruleString: "FREQ=DAILY;INTERVAL=7",
      method: "Start",
      completionDate: "2026-01-10T07:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "s2", count: 1 },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.anchor).toBe("2026-01-10T07:00:00.000Z");
    // 7 days after the completion anchor (Jan 10) is Jan 17, strictly after now.
    expect(out.data.occurrences).toEqual(["2026-01-17T07:00:00.000Z"]);
  });

  it("reports a non-repeating task with an empty occurrence list", async () => {
    const rule = makeRule({ id: "n", name: "One-off task", ruleString: null });
    const out = await runNextOccurrences(
      { taskId: "n" },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeating).toBe(false);
    expect(out.data.occurrences).toEqual([]);
  });

  it("reports an unparseable rule as repeating but not parseable", async () => {
    const rule = makeRule({
      id: "u",
      name: "Weird rule",
      ruleString: "TOTALLY-NOT-AN-RRULE",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "u" },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeating).toBe(true);
    expect(out.data.parseable).toBe(false);
    expect(out.data.occurrences).toEqual([]);
  });

  it("fails when the task does not exist", async () => {
    const out = await runNextOccurrences(
      { taskId: "missing" },
      { readTaskRule: stubReader(null), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(false);
    if (out.success) throw new Error("expected failure");
    expect(out.error.message).toContain("missing");
  });

  it("respects a `from` override that filters out near-term occurrences", async () => {
    const rule = makeRule({
      id: "a",
      name: "Pay rent",
      ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      // `from` past Feb/Mar means the first returned occurrence is Apr 1.
      { taskId: "a", count: 2, from: "2026-03-15T00:00:00.000Z" },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.occurrences).toEqual([
      "2026-04-01T09:00:00.000Z",
      "2026-05-01T09:00:00.000Z",
    ]);
  });

  it("defaults to 5 occurrences when count is omitted", async () => {
    const rule = makeRule({
      id: "d",
      name: "Daily standup",
      ruleString: "FREQ=DAILY",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "d" },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.occurrences).toHaveLength(5);
    // recomputed: now is 2026-01-15T00:00Z; the anchor's 09:00 instant on Jan 15
    // is strictly after now, so the first occurrence is Jan 15 09:00, not Jan 16.
    expect(out.data.occurrences).toEqual([
      "2026-01-15T09:00:00.000Z",
      "2026-01-16T09:00:00.000Z",
      "2026-01-17T09:00:00.000Z",
      "2026-01-18T09:00:00.000Z",
      "2026-01-19T09:00:00.000Z",
    ]);
  });

  it("defaults the repeatMethod to 'due-again' when the OmniFocus method is null", async () => {
    const rule = makeRule({
      id: "nm",
      name: "Method-less repeat",
      ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
      method: null,
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const out = await runNextOccurrences(
      { taskId: "nm", count: 1 },
      { readTaskRule: stubReader(rule), now: "2026-01-15T00:00:00.000Z" },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.repeatMethod).toBe("due-again");
    // method:null is not "Start", so it is treated as predictable/schedule-anchored.
    expect(out.data.predictable).toBe(true);
    expect(out.data.occurrences).toEqual(["2026-02-01T09:00:00.000Z"]);
  });
});
