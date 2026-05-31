import { describe, it, expect } from "vitest";
import { dueIn, overdueBy } from "../../src/recurrence/duration.js";

describe("dueIn", () => {
  it("returns the duration until a future target", () => {
    expect(
      dueIn("2026-01-03T12:00:00.000Z", "2026-01-01T09:00:00.000Z")
    ).toEqual({
      totalMinutes: 2 * 1440 + 3 * 60,
      days: 2,
      hours: 3,
      minutes: 0,
      humanized: "2d 3h",
    });
  });
  it("humanizes hours+minutes", () => {
    expect(
      dueIn("2026-01-01T14:10:00.000Z", "2026-01-01T09:00:00.000Z")?.humanized
    ).toBe("5h 10m");
  });
  it("humanizes minutes only", () => {
    expect(
      dueIn("2026-01-01T09:45:00.000Z", "2026-01-01T09:00:00.000Z")?.humanized
    ).toBe("45m");
  });
  it("drops a zero trailing unit (exact days)", () => {
    expect(
      dueIn("2026-01-03T09:00:00.000Z", "2026-01-01T09:00:00.000Z")?.humanized
    ).toBe("2d");
  });
  it("returns null when the target is already past (use overdueBy)", () => {
    expect(dueIn("2026-01-01T08:00:00.000Z", "2026-01-01T09:00:00.000Z")).toBeNull();
  });
  it("returns null for a null/absent target", () => {
    expect(dueIn(null, "2026-01-01T09:00:00.000Z")).toBeNull();
  });
});

describe("overdueBy", () => {
  it("returns the duration since a past target", () => {
    expect(
      overdueBy("2026-01-01T09:00:00.000Z", "2026-01-03T12:00:00.000Z")
    ).toEqual({
      totalMinutes: 2 * 1440 + 3 * 60,
      days: 2,
      hours: 3,
      minutes: 0,
      humanized: "2d 3h",
    });
  });
  it("returns null when the target is in the future", () => {
    expect(overdueBy("2026-01-02T09:00:00.000Z", "2026-01-01T09:00:00.000Z")).toBeNull();
  });
  it("returns null for a null target", () => {
    expect(overdueBy(null, "2026-01-01T09:00:00.000Z")).toBeNull();
  });
});
