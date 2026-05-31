/**
 * Tests for the pure helpers backing the `today` and `this-week` digest
 * commands. These helpers receive task arrays and a fixed `now` instant, so the
 * suite never touches a live OmniFocus instance.
 *
 * Duration semantics follow `src/recurrence/duration.ts` (dueIn / overdueBy):
 * both decompose a positive millisecond span into days/hours/minutes.
 *
 * All dates are reasoned about against the UTC calendar.
 */
import { describe, expect, it } from "vitest";
import type { OFTask } from "@ofocus/sdk";
import {
  endOfUtcDay,
  groupByDay,
  partitionToday,
  startOfNextUtcDay,
} from "../../src/commands/digests.js";

/**
 * Build an {@link OFTask} with sensible defaults; override per-test. Extracted
 * to keep each test focused on the fields that matter to it.
 */
function makeTask(overrides: Partial<OFTask> = {}): OFTask {
  return {
    id: "t",
    name: "Untitled",
    note: null,
    flagged: false,
    completed: false,
    dueDate: null,
    deferDate: null,
    completionDate: null,
    projectId: null,
    projectName: null,
    tags: [],
    estimatedMinutes: null,
    ...overrides,
  };
}

// Fixed reference instant for the whole suite (a Thursday, 12:00 UTC).
const NOW = "2026-01-15T12:00:00.000Z";
// End of NOW's UTC calendar day.
const END_OF_TODAY = "2026-01-15T23:59:59.999Z";

describe("endOfUtcDay", () => {
  it("returns 23:59:59.999Z of the input's UTC calendar day", () => {
    expect(endOfUtcDay(NOW)).toBe(END_OF_TODAY);
  });

  it("ignores the time-of-day and keeps the same UTC date", () => {
    // 00:00:00 and 23:00:00 on the same UTC day collapse to the same end-of-day.
    expect(endOfUtcDay("2026-01-15T00:00:00.000Z")).toBe(END_OF_TODAY);
    expect(endOfUtcDay("2026-01-15T23:00:00.000Z")).toBe(END_OF_TODAY);
  });
});

describe("startOfNextUtcDay", () => {
  // Regression (PR #61 review): the `today` due query must include the entire
  // current UTC day, so the exclusive upper bound is the next day's midnight.
  it("returns 00:00:00.000Z of the day after the input's UTC calendar day", () => {
    expect(startOfNextUtcDay("2026-01-15T12:00:00.000Z")).toBe(
      "2026-01-16T00:00:00.000Z",
    );
  });

  it("ignores the time-of-day and advances exactly one UTC day", () => {
    expect(startOfNextUtcDay("2026-01-15T00:00:00.000Z")).toBe(
      "2026-01-16T00:00:00.000Z",
    );
    expect(startOfNextUtcDay("2026-01-15T23:59:59.999Z")).toBe(
      "2026-01-16T00:00:00.000Z",
    );
  });

  it("rolls over month and year boundaries", () => {
    expect(startOfNextUtcDay("2026-01-31T08:00:00.000Z")).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(startOfNextUtcDay("2026-12-31T08:00:00.000Z")).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("partitionToday", () => {
  it("places a past-due task in `overdue` with overdueBy", () => {
    // Due Jan 10 12:00 vs now Jan 15 12:00 → exactly 5 days elapsed.
    const overdueTask = makeTask({
      id: "od",
      name: "Overdue",
      dueDate: "2026-01-10T12:00:00.000Z",
    });

    const { overdue, dueToday, flagged } = partitionToday(
      [overdueTask],
      NOW,
      END_OF_TODAY,
    );

    expect(overdue).toHaveLength(1);
    expect(dueToday).toHaveLength(0);
    expect(flagged).toHaveLength(0);

    const item = overdue[0];
    expect(item?.id).toBe("od");
    expect(item?.bucket).toBe("overdue");
    // 5 days = 7200 minutes (recomputed against UTC calendar).
    expect(item?.duration?.totalMinutes).toBe(7200);
    expect(item?.duration?.days).toBe(5);
    expect(item?.duration?.humanized).toBe("5d");
  });

  it("places a task due later today in `dueToday` with dueIn", () => {
    // Due Jan 15 18:00 vs now Jan 15 12:00 → 6 hours remaining, same UTC day.
    const dueTodayTask = makeTask({
      id: "dt",
      name: "Due today",
      dueDate: "2026-01-15T18:00:00.000Z",
    });

    const { overdue, dueToday, flagged } = partitionToday(
      [dueTodayTask],
      NOW,
      END_OF_TODAY,
    );

    expect(overdue).toHaveLength(0);
    expect(dueToday).toHaveLength(1);
    expect(flagged).toHaveLength(0);

    const item = dueToday[0];
    expect(item?.id).toBe("dt");
    expect(item?.bucket).toBe("due-today");
    // 6 hours = 360 minutes (recomputed).
    expect(item?.duration?.totalMinutes).toBe(360);
    expect(item?.duration?.hours).toBe(6);
    expect(item?.duration?.humanized).toBe("6h");
  });

  it("treats a task due exactly at end-of-day as `dueToday`", () => {
    const edge = makeTask({ id: "edge", dueDate: END_OF_TODAY });

    const { dueToday } = partitionToday([edge], NOW, END_OF_TODAY);

    expect(dueToday.map((t) => t.id)).toEqual(["edge"]);
  });

  it("places a flagged task with no due date in `flagged`", () => {
    const flaggedTask = makeTask({
      id: "fl",
      name: "Flagged",
      flagged: true,
      dueDate: null,
    });

    const { overdue, dueToday, flagged } = partitionToday(
      [flaggedTask],
      NOW,
      END_OF_TODAY,
    );

    expect(overdue).toHaveLength(0);
    expect(dueToday).toHaveLength(0);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.id).toBe("fl");
    expect(flagged[0]?.bucket).toBe("flagged");
  });

  it("does not duplicate a flagged task that is also overdue", () => {
    // Flagged AND past-due → must appear only in `overdue`, not `flagged`.
    const flaggedOverdue = makeTask({
      id: "fo",
      flagged: true,
      dueDate: "2026-01-10T12:00:00.000Z",
    });

    const { overdue, dueToday, flagged } = partitionToday(
      [flaggedOverdue],
      NOW,
      END_OF_TODAY,
    );

    expect(overdue.map((t) => t.id)).toEqual(["fo"]);
    expect(dueToday).toHaveLength(0);
    expect(flagged).toHaveLength(0);
  });

  it("excludes completed tasks from every bucket", () => {
    // A completed task that would otherwise be overdue, due-today, and flagged.
    const done = makeTask({
      id: "done",
      flagged: true,
      completed: true,
      dueDate: "2026-01-10T12:00:00.000Z",
    });

    const { overdue, dueToday, flagged } = partitionToday(
      [done],
      NOW,
      END_OF_TODAY,
    );

    expect(overdue).toHaveLength(0);
    expect(dueToday).toHaveLength(0);
    expect(flagged).toHaveLength(0);
  });

  it("produces correct counts across a mixed input set", () => {
    const tasks = [
      makeTask({ id: "od", dueDate: "2026-01-10T12:00:00.000Z" }),
      makeTask({ id: "dt", dueDate: "2026-01-15T18:00:00.000Z" }),
      makeTask({ id: "fl", flagged: true }),
      makeTask({ id: "done", completed: true, flagged: true }),
    ];

    const { overdue, dueToday, flagged } = partitionToday(
      tasks,
      NOW,
      END_OF_TODAY,
    );

    expect(overdue).toHaveLength(1);
    expect(dueToday).toHaveLength(1);
    expect(flagged).toHaveLength(1);
  });
});

describe("groupByDay", () => {
  it("groups tasks by UTC calendar day ascending, ascending within a day", () => {
    // Three distinct UTC days, deliberately out of order, plus a null-due task.
    const tasks = [
      makeTask({ id: "b1", dueDate: "2026-01-17T09:00:00.000Z" }),
      makeTask({ id: "a2", dueDate: "2026-01-16T18:00:00.000Z" }),
      makeTask({ id: "a1", dueDate: "2026-01-16T08:00:00.000Z" }),
      makeTask({ id: "c1", dueDate: "2026-01-20T12:00:00.000Z" }),
      makeTask({ id: "none", dueDate: null }),
    ];

    const groups = groupByDay(tasks, NOW);

    // Ascending day groups; the null-due task is excluded entirely.
    expect(groups.map((g) => g.date)).toEqual([
      "2026-01-16",
      "2026-01-17",
      "2026-01-20",
    ]);

    // Within Jan 16, ascending by dueDate: a1 (08:00) before a2 (18:00).
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(["a1", "a2"]);
    expect(groups[1]?.tasks.map((t) => t.id)).toEqual(["b1"]);
    expect(groups[2]?.tasks.map((t) => t.id)).toEqual(["c1"]);
  });

  it("annotates each task with dueIn relative to now", () => {
    // Jan 16 12:00 is exactly 24h after now (Jan 15 12:00).
    const tasks = [makeTask({ id: "x", dueDate: "2026-01-16T12:00:00.000Z" })];

    const groups = groupByDay(tasks, NOW);

    const item = groups[0]?.tasks[0];
    // 24h = 1440 minutes = 1 day (recomputed).
    expect(item?.dueIn?.totalMinutes).toBe(1440);
    expect(item?.dueIn?.days).toBe(1);
    expect(item?.dueIn?.humanized).toBe("1d");
  });

  it("returns an empty array when no task has a due date", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];

    expect(groupByDay(tasks, NOW)).toEqual([]);
  });
});
