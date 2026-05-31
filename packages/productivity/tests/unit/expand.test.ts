/**
 * Tests for expandOccurrences (RFC 5545 §3.3.10 recurrence expansion).
 * All dates are UTC. Reference: 2026-01-01 is a Thursday (UTC).
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { describe, it, expect } from "vitest";
import type { RepetitionRule } from "@ofocus/sdk";
import { expandOccurrences } from "../../src/recurrence/expand.js";

const rule = (over: Partial<RepetitionRule>): RepetitionRule => ({
  frequency: "daily",
  interval: 1,
  repeatMethod: "scheduled",
  ...over,
});

describe("expandOccurrences — daily", () => {
  it("daily interval 1, next 3 after anchor", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "daily" }),
        "2026-01-01T09:00:00.000Z",
        3
      )
    ).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-03T09:00:00.000Z",
      "2026-01-04T09:00:00.000Z",
    ]);
  });
  it("daily interval 3", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "daily", interval: 3 }),
        "2026-01-01T09:00:00.000Z",
        2
      )
    ).toEqual(["2026-01-04T09:00:00.000Z", "2026-01-07T09:00:00.000Z"]);
  });
  it("count 0 → empty", () => {
    expect(expandOccurrences(rule({}), "2026-01-01T09:00:00.000Z", 0)).toEqual(
      []
    );
  });
  it("respects fromISO (strictly after from)", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "daily" }),
        "2026-01-01T09:00:00.000Z",
        2,
        { fromISO: "2026-01-10T00:00:00.000Z" }
      )
    ).toEqual(["2026-01-10T09:00:00.000Z", "2026-01-11T09:00:00.000Z"]);
  });
});

describe("expandOccurrences — weekly", () => {
  it("weekly BYDAY=WE,FR (anchor Wed 2026-01-07), next 4", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "weekly", daysOfWeek: [3, 5] }),
        "2026-01-07T09:00:00.000Z",
        4
      )
    ).toEqual([
      "2026-01-09T09:00:00.000Z",
      "2026-01-14T09:00:00.000Z",
      "2026-01-16T09:00:00.000Z",
      "2026-01-21T09:00:00.000Z",
    ]);
  });
  it("weekly interval 2 on the anchor weekday (Thu 2026-01-01), next 2", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "weekly", interval: 2 }),
        "2026-01-01T09:00:00.000Z",
        2
      )
    ).toEqual(["2026-01-15T09:00:00.000Z", "2026-01-29T09:00:00.000Z"]);
  });
});

describe("expandOccurrences — monthly", () => {
  it("monthly BYMONTHDAY=15, next 3", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "monthly", dayOfMonth: 15 }),
        "2026-01-15T09:00:00.000Z",
        3
      )
    ).toEqual([
      "2026-02-15T09:00:00.000Z",
      "2026-03-15T09:00:00.000Z",
      "2026-04-15T09:00:00.000Z",
    ]);
  });
  it("monthly BYMONTHDAY=31 skips short months", () => {
    // After Jan 31 2026 (not leap): Feb/Apr/Jun lack a 31st ⇒ Mar 31, May 31, Jul 31
    expect(
      expandOccurrences(
        rule({ frequency: "monthly", dayOfMonth: 31 }),
        "2026-01-31T09:00:00.000Z",
        3
      )
    ).toEqual([
      "2026-03-31T09:00:00.000Z",
      "2026-05-31T09:00:00.000Z",
      "2026-07-31T09:00:00.000Z",
    ]);
  });
  it("monthly first Monday (BYDAY=1MO), anchor 2026-02-02 (first Mon), next 3", () => {
    expect(
      expandOccurrences(
        rule({
          frequency: "monthly",
          daysOfWeek: [1],
          daysOfWeekPositions: [1],
        }),
        "2026-02-02T09:00:00.000Z",
        3
      )
    ).toEqual([
      "2026-03-02T09:00:00.000Z",
      "2026-04-06T09:00:00.000Z",
      "2026-05-04T09:00:00.000Z",
    ]);
  });
});

describe("expandOccurrences — yearly", () => {
  it("yearly leap day (BYMONTH=2;BYMONTHDAY=29) skips non-leap years", () => {
    expect(
      expandOccurrences(
        rule({ frequency: "yearly", monthsOfYear: [2], dayOfMonth: 29 }),
        "2024-02-29T09:00:00.000Z",
        1
      )
    ).toEqual(["2028-02-29T09:00:00.000Z"]);
  });
});

describe("expandOccurrences — ordering & edge cases (regression)", () => {
  it("weekly including Sunday is ascending (all 7 days, anchor Thu 2026-01-01)", () => {
    // Bug 1 regression: raw-sort by weekday number placed Sun (0) first in each
    // block, but Sun is chronologically LAST in a Mon-started week (offset 6).
    // With the fix, days are sorted by offsetFromMonday so emission is ascending.
    const r = expandOccurrences(
      rule({ frequency: "weekly", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      "2026-01-01T09:00:00.000Z",
      9
    );
    expect(r).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-03T09:00:00.000Z",
      "2026-01-04T09:00:00.000Z",
      "2026-01-05T09:00:00.000Z",
      "2026-01-06T09:00:00.000Z",
      "2026-01-07T09:00:00.000Z",
      "2026-01-08T09:00:00.000Z",
      "2026-01-09T09:00:00.000Z",
      "2026-01-10T09:00:00.000Z",
    ]);
    expect(r).toEqual([...r].sort()); // ascending invariant
  });

  it("weekly Sun+Mon ascending (anchor Tue 2026-01-06)", () => {
    // Bug 1 regression: in a Mon-started week, Mon comes before Sun.
    // w=0: Mon Jan5 (filtered out, ≤ anchor), Sun Jan11
    // w=1: Mon Jan12, Sun Jan18
    // w=2: Mon Jan19 (4th result)
    expect(
      expandOccurrences(
        rule({ frequency: "weekly", daysOfWeek: [0, 1] }),
        "2026-01-06T09:00:00.000Z",
        4
      )
    ).toEqual([
      "2026-01-11T09:00:00.000Z",
      "2026-01-12T09:00:00.000Z",
      "2026-01-18T09:00:00.000Z",
      "2026-01-19T09:00:00.000Z",
    ]);
  });

  it("far-future from: daily honors a from >5.5y past the anchor", () => {
    // Bug 2 regression: from=2040-06-15 is ~5279 days after anchor 2026-01-01,
    // exceeding the old MAX_PERIODS=2000 scan window from the anchor.
    expect(
      expandOccurrences(
        rule({ frequency: "daily" }),
        "2026-01-01T09:00:00.000Z",
        2,
        { fromISO: "2040-06-15T00:00:00.000Z" }
      )
    ).toEqual([
      "2040-06-15T09:00:00.000Z",
      "2040-06-16T09:00:00.000Z",
    ]);
  });

  it("far-future from: monthly day-1", () => {
    // Bug 2 regression: from=2230-01-15 is 2448 months after anchor 2026-01,
    // exceeding the old MAX_PERIODS=2000 scan window from the anchor.
    expect(
      expandOccurrences(
        rule({ frequency: "monthly", dayOfMonth: 1 }),
        "2026-01-01T09:00:00.000Z",
        3,
        { fromISO: "2230-01-15T00:00:00.000Z" }
      )
    ).toEqual([
      "2230-02-01T09:00:00.000Z",
      "2230-03-01T09:00:00.000Z",
      "2230-04-01T09:00:00.000Z",
    ]);
  });

  it("monthly first & last Monday ([1,-1]×Mon), anchor first-Mon 2026-02-02", () => {
    // positions=[1,-1], daysOfWeek=[1] (Mon):
    // Feb2026: first=Feb2 (=anchor, filtered), last=Feb23 → emit Feb23
    // Mar2026: first=Mar2, last=Mar30 → emit Mar2, Mar30
    // Apr2026: first=Apr6 → emit Apr6 (4th result)
    expect(
      expandOccurrences(
        rule({
          frequency: "monthly",
          daysOfWeek: [1],
          daysOfWeekPositions: [1, -1],
        }),
        "2026-02-02T09:00:00.000Z",
        4
      )
    ).toEqual([
      "2026-02-23T09:00:00.000Z",
      "2026-03-02T09:00:00.000Z",
      "2026-03-30T09:00:00.000Z",
      "2026-04-06T09:00:00.000Z",
    ]);
  });

  it("monthly 5th Friday skips months without one (anchor 5th-Fri 2026-01-30)", () => {
    // Jan2026 5th Fri=Jan30 (=anchor, filtered). Feb/Mar/Apr/Jun only have 4
    // Fridays. May2026 5th Fri=May29; Jul2026 5th Fri=Jul31.
    expect(
      expandOccurrences(
        rule({
          frequency: "monthly",
          daysOfWeek: [5],
          daysOfWeekPositions: [5],
        }),
        "2026-01-30T09:00:00.000Z",
        2
      )
    ).toEqual([
      "2026-05-29T09:00:00.000Z",
      "2026-07-31T09:00:00.000Z",
    ]);
  });
});
