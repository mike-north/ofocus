/**
 * Tests for the `occurrences` command.
 *
 * Projects every incomplete repeating task forward over a time window and
 * returns a flattened, ascending list of upcoming occurrences. Dependencies
 * (`scanRepeatingTasks`, `now`) are injected so the suite never touches a live
 * OmniFocus instance.
 *
 * Recurrence semantics follow RFC 5545 §3.3.10 (RRULE).
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { describe, expect, it } from "vitest";
import type { TaskRule } from "../../src/recurrence/scan-rule.js";
import { runOccurrences } from "../../src/commands/occurrences.js";

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

/** A `scanRepeatingTasks` stub that resolves to the given rules. */
function stubScan(rules: TaskRule[]): () => Promise<TaskRule[]> {
  return () => Promise.resolve(rules);
}

// Jan 1 2026 is a Thursday (verified against the UTC calendar), so the first
// Mondays after Jan 1 are Jan 5 and Jan 12; Jan 19 falls outside a 14-day window.
const NOW = "2026-01-01T09:00:00.000Z";

describe("runOccurrences", () => {
  it("flattens occurrences across tasks within [now, now+14d], ascending", async () => {
    const weekly = makeRule({
      id: "w",
      name: "Weekly review",
      ruleString: "FREQ=WEEKLY;BYDAY=MO",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    const monthly = makeRule({
      id: "m",
      name: "Pay rent",
      ruleString: "FREQ=MONTHLY;BYMONTHDAY=1",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });

    const out = await runOccurrences(
      { days: 14 },
      { scanRepeatingTasks: stubScan([weekly, monthly]), now: NOW },
    );

    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");

    // Window: now=Jan 1 09:00 → until=Jan 15 09:00 (inclusive end).
    expect(out.data.window).toEqual({
      from: NOW,
      until: "2026-01-15T09:00:00.000Z",
      days: 14,
    });

    // Weekly Mondays within window: Jan 5, Jan 12 (Jan 19 is past until).
    // Monthly day-1 within window: next is Feb 1 (>until) → none.
    expect(out.data.count).toBe(2);
    expect(out.data.occurrences.map((o) => o.occurrenceDate)).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-12T09:00:00.000Z",
    ]);
    for (const o of out.data.occurrences) {
      expect(o.taskId).toBe("w");
      expect(o.name).toBe("Weekly review");
      // dueIn is computed from now; both occurrences are in the future.
      expect(o.dueIn).not.toBeNull();
    }
  });

  it("ignores tasks with no repetition rule (ruleString null)", async () => {
    const oneOff = makeRule({ id: "x", name: "One-off", ruleString: null });
    const out = await runOccurrences(
      { days: 14 },
      { scanRepeatingTasks: stubScan([oneOff]), now: NOW },
    );
    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.count).toBe(0);
    expect(out.data.occurrences).toEqual([]);
  });

  it("defaults the window to 14 days when days is omitted", async () => {
    const out = await runOccurrences(
      {},
      { scanRepeatingTasks: stubScan([]), now: NOW },
    );
    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.window.days).toBe(14);
    expect(out.data.window.until).toBe("2026-01-15T09:00:00.000Z");
  });

  it("returns an empty result when the scan finds no repeating tasks", async () => {
    const out = await runOccurrences(
      { days: 7 },
      { scanRepeatingTasks: stubScan([]), now: NOW },
    );
    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");
    expect(out.data.count).toBe(0);
    expect(out.data.occurrences).toEqual([]);
  });

  it("sorts interleaved occurrences across tasks ascending by date", async () => {
    // Task A: daily → Jan 2, 3, 4, ... at 09:00.
    const daily = makeRule({
      id: "d",
      name: "Daily standup",
      ruleString: "FREQ=DAILY",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });
    // Task B: weekly Mondays → Jan 5, 12 at 09:00 — interleaves with daily.
    const weekly = makeRule({
      id: "w",
      name: "Weekly review",
      ruleString: "FREQ=WEEKLY;BYDAY=MO",
      method: "DueDate",
      dueDate: "2026-01-01T09:00:00.000Z",
    });

    const out = await runOccurrences(
      { days: 5 },
      { scanRepeatingTasks: stubScan([daily, weekly]), now: NOW },
    );
    expect(out.success).toBe(true);
    if (!out.success) throw new Error("expected success");

    // Window: Jan 1 09:00 → Jan 6 09:00 (inclusive).
    // Daily: Jan 2,3,4,5,6 at 09:00. Weekly: Jan 5 at 09:00.
    const dates = out.data.occurrences.map((o) => o.occurrenceDate);
    expect(dates).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-03T09:00:00.000Z",
      "2026-01-04T09:00:00.000Z",
      "2026-01-05T09:00:00.000Z", // daily
      "2026-01-05T09:00:00.000Z", // weekly (same instant; both retained)
      "2026-01-06T09:00:00.000Z",
    ]);
    // Verify ascending ordering holds across the flattened list.
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]! >= dates[i - 1]!).toBe(true);
    }
  });

  it("rejects a non-positive days value", async () => {
    const out = await runOccurrences(
      { days: 0 },
      { scanRepeatingTasks: stubScan([]), now: NOW },
    );
    expect(out.success).toBe(false);
  });
});
