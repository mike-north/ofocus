/**
 * parseRRule — inverse of buildRRule from @ofocus/sdk.
 *
 * Converts an RFC 5545 RRULE string back into a RepetitionRule object,
 * accepting only the subset of RRULE that buildRRule can emit.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import type { RepetitionRule } from "@ofocus/sdk";

/** Regex for a single BYDAY token: optional signed integer prefix + 2-letter day code. */
const BYDAY_TOKEN_RE = /^([+-]?\d+)?([A-Z]{2})$/;

/**
 * Map a raw FREQ string to a frequency value, or `null` if unrecognised.
 * Avoids index-signature lookups so TypeScript can narrow the return type.
 */
function parseFreq(
  raw: string
): RepetitionRule["frequency"] | null {
  switch (raw) {
    case "DAILY":
      return "daily";
    case "WEEKLY":
      return "weekly";
    case "MONTHLY":
      return "monthly";
    case "YEARLY":
      return "yearly";
    default:
      return null;
  }
}

/**
 * Map a 2-letter RFC 5545 day code to a 0-indexed weekday (Sun=0..Sat=6),
 * or `null` if the code is unrecognised.
 * Avoids index-signature lookups so TypeScript can narrow the return type.
 */
function codeToDay(code: string): number | null {
  switch (code) {
    case "SU":
      return 0;
    case "MO":
      return 1;
    case "TU":
      return 2;
    case "WE":
      return 3;
    case "TH":
      return 4;
    case "FR":
      return 5;
    case "SA":
      return 6;
    default:
      return null;
  }
}

/**
 * Parse an RFC 5545 RRULE string into a RepetitionRule.
 *
 * This is the exact inverse of `buildRRule` from `@ofocus/sdk`: for any
 * RRULE string that `buildRRule` can produce, `parseRRule` will recover the
 * original `RepetitionRule` (minus `repeatMethod`, which is supplied as an
 * argument since it is encoded separately in OmniJS).
 *
 * Returns `null` when the string is missing, has no recognisable FREQ, or
 * contains malformed tokens (unknown day codes, bad BYDAY format, etc.).
 *
 * @param ruleString   - An RFC 5545 RRULE value string (e.g. `"FREQ=DAILY;INTERVAL=2"`).
 * @param repeatMethod - The repeat method to embed in the returned rule.
 */
export function parseRRule(
  ruleString: string,
  repeatMethod: RepetitionRule["repeatMethod"]
): RepetitionRule | null {
  // Build a KEY→VALUE map from the semicolon-delimited parts.
  const params = new Map<string, string>();
  for (const part of ruleString.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx);
    const value = part.slice(eqIdx + 1);
    if (key.length > 0) {
      params.set(key, value);
    }
  }

  // --- FREQ (required) ---
  const freqRaw = params.get("FREQ");
  if (freqRaw === undefined) return null;
  const frequency = parseFreq(freqRaw);
  if (frequency === null) return null;

  // --- INTERVAL (optional, default 1) ---
  const intervalRaw = params.get("INTERVAL");
  const interval =
    intervalRaw !== undefined ? parseInt(intervalRaw, 10) : 1;

  // --- BYDAY (optional) ---
  // Two forms produced by buildRRule:
  //   Plain:      BYDAY=MO,WE,FR          → daysOfWeek only
  //   Positional: BYDAY=1MO,-1MO          → daysOfWeek + daysOfWeekPositions
  let daysOfWeek: number[] | undefined;
  let daysOfWeekPositions: number[] | undefined;

  const bydayRaw = params.get("BYDAY");
  if (bydayRaw !== undefined) {
    const tokens = bydayRaw.split(",");

    // First pass: detect whether any token has a numeric prefix.
    let isPositional = false;
    for (const token of tokens) {
      const m = BYDAY_TOKEN_RE.exec(token);
      if (m === null) return null; // malformed token
      const posStr = m[1];
      if (posStr !== undefined && posStr !== "") {
        isPositional = true;
      }
    }

    if (isPositional) {
      // Positional form: collect positions and days in first-seen order,
      // deduplicating each set independently.
      //
      // buildRRule generates tokens in (positions outer) × (days inner) order,
      // so iterating tokens in order and deduplicating gives back the original
      // positions and days arrays — which is what the round-trip tests verify.
      const seenPositions = new Set<number>();
      const seenDays = new Set<number>();
      const positions: number[] = [];
      const days: number[] = [];

      for (const token of tokens) {
        const m = BYDAY_TOKEN_RE.exec(token);
        if (m === null) return null;

        const posStr = m[1];
        const code = m[2];

        if (posStr === undefined || posStr === "") {
          // Mixed positional/plain is not valid in buildRRule output.
          return null;
        }

        const pos = parseInt(posStr, 10);
        if (!seenPositions.has(pos)) {
          seenPositions.add(pos);
          positions.push(pos);
        }

        if (code === undefined) return null;
        const dayNum = codeToDay(code);
        if (dayNum === null) return null;
        if (!seenDays.has(dayNum)) {
          seenDays.add(dayNum);
          days.push(dayNum);
        }
      }

      daysOfWeek = days;
      daysOfWeekPositions = positions;
    } else {
      // Plain form: day codes only, no positional prefix.
      const days: number[] = [];
      for (const token of tokens) {
        const m = BYDAY_TOKEN_RE.exec(token);
        if (m === null) return null;
        const code = m[2];
        if (code === undefined) return null;
        const dayNum = codeToDay(code);
        if (dayNum === null) return null;
        days.push(dayNum);
      }
      daysOfWeek = days;
    }
  }

  // --- BYMONTH (optional) → monthsOfYear ---
  let monthsOfYear: number[] | undefined;
  const bymonthRaw = params.get("BYMONTH");
  if (bymonthRaw !== undefined) {
    monthsOfYear = bymonthRaw.split(",").map((s) => parseInt(s, 10));
  }

  // --- BYMONTHDAY (optional) → dayOfMonth ---
  let dayOfMonth: number | undefined;
  const bymonthdayRaw = params.get("BYMONTHDAY");
  if (bymonthdayRaw !== undefined) {
    dayOfMonth = parseInt(bymonthdayRaw, 10);
  }

  // Assemble result, omitting undefined optional fields to satisfy
  // exactOptionalPropertyTypes (never assign `undefined` to optional props).
  const result: RepetitionRule = { frequency, interval, repeatMethod };

  if (daysOfWeek !== undefined) {
    result.daysOfWeek = daysOfWeek;
  }
  if (daysOfWeekPositions !== undefined) {
    result.daysOfWeekPositions = daysOfWeekPositions;
  }
  if (monthsOfYear !== undefined) {
    result.monthsOfYear = monthsOfYear;
  }
  if (dayOfMonth !== undefined) {
    result.dayOfMonth = dayOfMonth;
  }

  return result;
}
