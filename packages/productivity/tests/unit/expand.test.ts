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
