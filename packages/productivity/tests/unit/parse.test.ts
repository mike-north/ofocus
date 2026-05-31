/**
 * Tests for parseRRule — the inverse of buildRRule.
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { describe, it, expect } from "vitest";
import { buildRRule } from "@ofocus/sdk";
import { parseRRule } from "../../src/recurrence/parse.js";

describe("parseRRule", () => {
  it("parses FREQ=DAILY with default interval 1", () => {
    expect(parseRRule("FREQ=DAILY", "due-again")).toEqual({
      frequency: "daily", interval: 1, repeatMethod: "due-again",
    });
  });
  it("parses INTERVAL", () => {
    expect(parseRRule("FREQ=DAILY;INTERVAL=3", "scheduled")).toEqual({
      frequency: "daily", interval: 3, repeatMethod: "scheduled",
    });
  });
  it("parses plain BYDAY into daysOfWeek (0=Sun..6=Sat)", () => {
    expect(parseRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR", "due-again")).toEqual({
      frequency: "weekly", interval: 1, repeatMethod: "due-again", daysOfWeek: [1, 3, 5],
    });
  });
  it("parses BYMONTHDAY into dayOfMonth", () => {
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=15", "due-again")).toEqual({
      frequency: "monthly", interval: 1, repeatMethod: "due-again", dayOfMonth: 15,
    });
  });
  it("parses positional BYDAY into daysOfWeek + daysOfWeekPositions", () => {
    // 1MO,-1MO ⇒ positions [1,-1], days [1]
    expect(parseRRule("FREQ=MONTHLY;BYDAY=1MO,-1MO", "due-again")).toEqual({
      frequency: "monthly", interval: 1, repeatMethod: "due-again",
      daysOfWeek: [1], daysOfWeekPositions: [1, -1],
    });
  });
  it("parses YEARLY with BYMONTH and BYMONTHDAY", () => {
    expect(parseRRule("FREQ=YEARLY;BYMONTH=3,6;BYMONTHDAY=25", "scheduled")).toEqual({
      frequency: "yearly", interval: 1, repeatMethod: "scheduled",
      monthsOfYear: [3, 6], dayOfMonth: 25,
    });
  });
  it("returns null for missing/unknown FREQ", () => {
    expect(parseRRule("", "due-again")).toBeNull();
    expect(parseRRule("INTERVAL=2", "due-again")).toBeNull();
    expect(parseRRule("FREQ=BOGUS", "due-again")).toBeNull();
  });

  // Round-trip: buildRRule must reproduce the string parseRRule consumed.
  const rules = [
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
    "FREQ=MONTHLY;BYMONTHDAY=15",
    "FREQ=MONTHLY;BYDAY=1MO,-1MO",
    "FREQ=MONTHLY;INTERVAL=2;BYDAY=1MO,1WE,-1MO,-1WE",
    "FREQ=YEARLY;BYMONTH=3,6;BYMONTHDAY=25",
  ];
  it.each(rules)("round-trips %s through buildRRule", (s) => {
    const parsed = parseRRule(s, "due-again");
    expect(parsed).not.toBeNull();
    expect(buildRRule(parsed!)).toBe(s);
  });
});

describe("parseRRule — strict rejection (regression, PR #61 review)", () => {
  it.each([
    "FREQ=DAILY;COUNT=3",
    "FREQ=DAILY;UNTIL=20260101T000000Z",
    "FREQ=WEEKLY;WKST=MO;BYDAY=MO",
    "FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO",
    "FREQ=DAILY;INTERVAL=2x",
    "FREQ=DAILY;INTERVAL=abc",
    "FREQ=DAILY;INTERVAL=0",
    "FREQ=YEARLY;BYMONTH=13;BYMONTHDAY=1",
    "FREQ=YEARLY;BYMONTH=3x;BYMONTHDAY=1",
    "FREQ=MONTHLY;BYMONTHDAY=32",
    "FREQ=MONTHLY;BYMONTHDAY=0",
    "FREQ=MONTHLY;BYDAY=6MO",
    "FREQ=MONTHLY;BYDAY=0MO",
  ])("rejects unsupported/malformed rule %s", (s) => {
    expect(parseRRule(s, "due-again")).toBeNull();
  });

  // Additional edge cases beyond the PR-listed set.
  it.each([
    "FREQ=YEARLY;BYMONTH=0;BYMONTHDAY=1", // BYMONTH below range
    "FREQ=MONTHLY;BYMONTHDAY=15x", // trailing garbage on BYMONTHDAY
    "FREQ=MONTHLY;BYDAY=-6FR", // negative position out of range
    "FREQ=MONTHLY;INTERVAL=-1", // negative interval
  ])("rejects out-of-range/malformed rule %s", (s) => {
    expect(parseRRule(s, "due-again")).toBeNull();
  });
});
