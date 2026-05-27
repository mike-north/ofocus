/**
 * Tests for the shared query date parser.
 *
 * @see https://en.wikipedia.org/wiki/ISO_8601
 */
import { describe, expect, it } from "vitest";
import { parseDate, parseDuration } from "../../../src/query/dates.js";
import { ErrorCode } from "../../../src/errors.js";

const REFERENCE = new Date("2026-05-27T12:00:00.000Z");

function isError(
  v: { iso: string } | { code: ErrorCode }
): v is { code: ErrorCode } {
  return "code" in v;
}

function isNumber(v: number | { code: ErrorCode }): v is number {
  return typeof v === "number";
}

describe("parseDuration", () => {
  it("parses days", () => {
    const r = parseDuration("7d");
    expect(isNumber(r)).toBe(true);
    if (isNumber(r)) expect(r).toBe(7 * 86_400_000);
  });

  it("parses weeks", () => {
    const r = parseDuration("2w");
    expect(isNumber(r)).toBe(true);
    if (isNumber(r)) expect(r).toBe(14 * 86_400_000);
  });

  it("parses months (30d approx)", () => {
    const r = parseDuration("1m");
    expect(isNumber(r)).toBe(true);
    if (isNumber(r)) expect(r).toBe(30 * 86_400_000);
  });

  it("parses years (365d approx)", () => {
    const r = parseDuration("1y");
    expect(isNumber(r)).toBe(true);
    if (isNumber(r)) expect(r).toBe(365 * 86_400_000);
  });

  it("accepts whitespace between number and unit", () => {
    const r = parseDuration("3 d");
    expect(isNumber(r)).toBe(true);
    if (isNumber(r)) expect(r).toBe(3 * 86_400_000);
  });

  it("accepts uppercase units", () => {
    const r = parseDuration("7D");
    expect(isNumber(r)).toBe(true);
  });

  it("rejects empty string", () => {
    const r = parseDuration("");
    expect(isNumber(r)).toBe(false);
  });

  it("rejects bad unit", () => {
    const r = parseDuration("7x");
    expect(isNumber(r)).toBe(false);
  });

  it("rejects non-numeric quantity", () => {
    const r = parseDuration("abc");
    expect(isNumber(r)).toBe(false);
  });

  it("rejects negative-looking quantities (regex doesn't match)", () => {
    const r = parseDuration("-3d");
    expect(isNumber(r)).toBe(false);
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — runtime safety check
    const r = parseDuration(123);
    expect(isNumber(r)).toBe(false);
  });
});

describe("parseDate", () => {
  describe("ISO 8601", () => {
    it("parses date-only string as UTC midnight", () => {
      const r = parseDate("2026-05-30", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-30T00:00:00.000Z");
    });

    it("parses full ISO datetime with Z", () => {
      const r = parseDate("2026-05-30T14:00:00Z", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-30T14:00:00.000Z");
    });

    it("parses ISO datetime without timezone (local-as-UTC ambiguity, but new Date interprets it)", () => {
      // Without `Z`, the JS Date constructor interprets as local time.
      // We accept whatever the platform produces — just verify it parses.
      const r = parseDate("2026-05-30T14:00:00", REFERENCE);
      expect(isError(r)).toBe(false);
    });

    it("parses ISO with offset", () => {
      const r = parseDate("2026-05-30T14:00:00+05:00", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-30T09:00:00.000Z");
    });

    it("parses ISO with milliseconds", () => {
      const r = parseDate("2026-05-30T14:00:00.123Z", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-30T14:00:00.123Z");
    });
  });

  describe("relative keywords", () => {
    it('parses "today" as UTC midnight of the reference', () => {
      const r = parseDate("today", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-27T00:00:00.000Z");
    });

    it('parses "tomorrow"', () => {
      const r = parseDate("tomorrow", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-28T00:00:00.000Z");
    });

    it('parses "yesterday"', () => {
      const r = parseDate("yesterday", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-26T00:00:00.000Z");
    });

    it("is case-insensitive on keywords", () => {
      const r = parseDate("Today", REFERENCE);
      expect(isError(r)).toBe(false);
    });

    it('parses "now"', () => {
      const r = parseDate("now", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-27T12:00:00.000Z");
    });
  });

  describe("bare offsets", () => {
    it('parses "7d" as reference + 7 days', () => {
      const r = parseDate("7d", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-06-03T12:00:00.000Z");
    });

    it('parses "1w" as reference + 7 days', () => {
      const r = parseDate("1w", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-06-03T12:00:00.000Z");
    });

    it('parses "1y" as reference + 365 days', () => {
      const r = parseDate("1y", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2027-05-27T12:00:00.000Z");
    });
  });

  describe("prefixed offsets", () => {
    it('parses "in 3 days"', () => {
      const r = parseDate("in 3 days", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-05-30T12:00:00.000Z");
    });

    it('parses "in 1 week"', () => {
      const r = parseDate("in 1 week", REFERENCE);
      expect(isError(r)).toBe(false);
      if (!isError(r)) expect(r.iso).toBe("2026-06-03T12:00:00.000Z");
    });

    it('parses "in 2 months"', () => {
      const r = parseDate("in 2 months", REFERENCE);
      expect(isError(r)).toBe(false);
    });

    it("singular vs plural is accepted", () => {
      const a = parseDate("in 1 day", REFERENCE);
      const b = parseDate("in 1 days", REFERENCE);
      expect(isError(a)).toBe(false);
      expect(isError(b)).toBe(false);
    });
  });

  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      const r = parseDate("", REFERENCE);
      expect(isError(r)).toBe(true);
      if (isError(r)) expect(r.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("rejects whitespace-only", () => {
      const r = parseDate("   ", REFERENCE);
      expect(isError(r)).toBe(true);
    });

    it("rejects quotes (injection attempt)", () => {
      const r = parseDate('2026-05-30"', REFERENCE);
      expect(isError(r)).toBe(true);
    });

    it("rejects backslashes (injection attempt)", () => {
      const r = parseDate("2026-05-30\\", REFERENCE);
      expect(isError(r)).toBe(true);
    });

    it("rejects gibberish", () => {
      const r = parseDate("not-a-date", REFERENCE);
      expect(isError(r)).toBe(true);
      if (isError(r)) expect(r.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    });

    it("rejects non-string", () => {
      // @ts-expect-error — runtime safety check
      const r = parseDate(12345, REFERENCE);
      expect(isError(r)).toBe(true);
    });

    it('rejects "in N foo" where foo is not a unit', () => {
      const r = parseDate("in 3 lightyears", REFERENCE);
      expect(isError(r)).toBe(true);
    });
  });
});
