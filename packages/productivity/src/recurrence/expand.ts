/**
 * expandOccurrences — RFC 5545 §3.3.10 recurrence expander.
 *
 * Enumerates the next N occurrences of a {@link RepetitionRule}, starting from
 * (and strictly after) a reference instant. The function is **pure** and
 * **deterministic**: it never reads the wall clock — the anchor and the
 * optional `from` boundary are injected as ISO strings.
 *
 * ## Time zone & DST caveat
 *
 * All calendar arithmetic is performed in **UTC** (`Date.UTC`,
 * `getUTC*`). This makes the output deterministic regardless of the host
 * machine's timezone, which is essential for CI stability. The practical
 * consequence is that occurrences inherit the anchor's **UTC** time-of-day,
 * not its local-wall-clock time-of-day. A rule anchored at "09:00 local" in a
 * DST-observing zone is treated purely as its UTC instant; this expander does
 * not attempt to preserve local wall-clock time across DST transitions. For
 * the productivity use cases here (date-driven recurrence) this is the
 * intended, well-defined behaviour.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import type { RepetitionRule } from "@ofocus/sdk";

/**
 * Upper bound on how many periods (days / weeks / months / years) we scan
 * PAST the `from` boundary before giving up. Guards against pathological rules
 * that never produce `count` occurrences (e.g. an impossible BYMONTHDAY).
 * When the cap is reached we return whatever has been collected so far.
 *
 * The skip-ahead logic (see below) ensures we start the scan at the period
 * containing `from`, so this cap governs the search window after `from`, not
 * the absolute distance from the anchor.
 */
const MAX_PERIODS = 2000;

/** UTC time-of-day components carried from the anchor onto every occurrence. */
interface TimeOfDay {
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
}

/** Number of days in a given (UTC) month. `month` is 0-indexed. */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Construct a UTC ISO timestamp for the given Y/M/D + time-of-day, but only if
 * the constructed date actually lands on the requested Y/M/D. `Date.UTC` rolls
 * overflowing components forward (e.g. day 31 of a 30-day month becomes the 1st
 * of the next month), so we validate by reading the components back. Returns
 * `null` when the date is invalid (must be skipped per RFC 5545 — no clamping).
 */
function makeISO(
  year: number,
  month: number,
  day: number,
  time: TimeOfDay
): string | null {
  const ms = Date.UTC(
    year,
    month,
    day,
    time.hours,
    time.minutes,
    time.seconds,
    time.ms
  );
  const d = new Date(ms);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d.toISOString();
}

/**
 * Day-of-month (1-based) of the Nth occurrence of `weekday` within a month, or
 * `null` if it does not exist (e.g. a 5th Monday in a month with only four).
 *
 * @param weekday 0=Sun .. 6=Sat
 * @param position 1-based from the start of the month; negative counts from the
 *   end (-1 = last, -2 = second-to-last, ...).
 */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  position: number
): number | null {
  if (position === 0) {
    return null;
  }
  const total = daysInMonth(year, month);

  // Collect every day-of-month that falls on `weekday`, in ascending order.
  const matches: number[] = [];
  for (let day = 1; day <= total; day++) {
    if (new Date(Date.UTC(year, month, day)).getUTCDay() === weekday) {
      matches.push(day);
    }
  }

  if (position > 0) {
    const idx = position - 1;
    return idx < matches.length ? (matches[idx] ?? null) : null;
  }
  // Negative: count from the end.
  const idx = matches.length + position;
  return idx >= 0 ? (matches[idx] ?? null) : null;
}

/**
 * Map a 0-indexed weekday (Sun=0..Sat=6) to its offset from Monday, where
 * Monday=0..Sunday=6. Used for week stepping with WKST=Monday (RFC 5545 default).
 *
 * This ordering ensures days are emitted in chronological order within a
 * Monday-started week: Mon(0) < Tue(1) < Wed(2) < Thu(3) < Fri(4) < Sat(5) < Sun(6).
 * Note that sorting by raw weekday number would place Sunday (0) first, which is
 * chronologically last in a Mon-started week — Bug 1.
 */
function offsetFromMonday(weekday: number): number {
  return (weekday + 6) % 7;
}

/**
 * Produce the month-day candidates for a single active month (used by both
 * monthly and yearly expansion). Returns ISO strings in ascending order;
 * invalid dates are skipped (never clamped).
 */
function monthCandidates(
  rule: RepetitionRule,
  year: number,
  month: number,
  anchorDay: number,
  time: TimeOfDay
): string[] {
  const positions = rule.daysOfWeekPositions;
  const weekdays = rule.daysOfWeek;

  if (positions && positions.length > 0 && weekdays && weekdays.length > 0) {
    // Nth-weekday expansion: cross-product of positions × weekdays.
    const days: number[] = [];
    for (const position of positions) {
      for (const weekday of weekdays) {
        const day = nthWeekdayOfMonth(year, month, weekday, position);
        if (day !== null) {
          days.push(day);
        }
      }
    }
    // Ascending and de-duplicated within the month.
    const unique = Array.from(new Set(days)).sort((a, b) => a - b);
    const out: string[] = [];
    for (const day of unique) {
      const iso = makeISO(year, month, day, time);
      if (iso !== null) {
        out.push(iso);
      }
    }
    return out;
  }

  // Month-day expansion: explicit dayOfMonth, else the anchor's day-of-month.
  const day = rule.dayOfMonth ?? anchorDay;
  const iso = makeISO(year, month, day, time);
  return iso !== null ? [iso] : [];
}

/** Milliseconds per day — used for skip-ahead distance estimates and day arithmetic. */
const MS_PER_DAY = 86_400_000;

/**
 * Midnight-UTC epoch-ms for a given Y/M/D (0-indexed month). Used as a
 * base for day-offset arithmetic so that large offsets don't need to be
 * smuggled through `makeISO`'s anchor-relative Y/M/D approach.
 */
function midnightUTC(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day, 0, 0, 0, 0);
}

/**
 * Construct an ISO string that is `dayOffset` days after `baseMidnightMs`,
 * carrying the given `time` of day. Returns `null` only when `Date.UTC`
 * produces a non-finite result (which is not possible for valid inputs, but
 * guards against theoretical overflow at extreme years).
 *
 * Unlike `makeISO`, this function does NOT check that Y/M/D round-trips: the
 * offset arithmetic guarantees the right date when `baseMidnightMs` is a
 * true midnight-UTC value and `dayOffset` is an integer.
 */
function makeISOFromOffset(
  baseMidnightMs: number,
  dayOffset: number,
  time: TimeOfDay
): string | null {
  const targetMs =
    baseMidnightMs +
    dayOffset * MS_PER_DAY +
    time.hours * 3_600_000 +
    time.minutes * 60_000 +
    time.seconds * 1_000 +
    time.ms;
  if (!Number.isFinite(targetMs)) {
    return null;
  }
  return new Date(targetMs).toISOString();
}

/**
 * Enumerate the next `count` occurrences of `rule`, anchored at `anchorISO`,
 * that fall strictly after the `from` boundary (default: the anchor itself).
 *
 * ## Skip-ahead
 *
 * Period loops are indexed from the anchor (period 0). When `from` is far in
 * the future the loop would have to iterate through millions of periods before
 * finding any qualifying occurrence — exceeding `MAX_PERIODS` and returning
 * nothing. To avoid this, each frequency computes a conservative lower bound
 * for the first period that could possibly produce an occurrence after `from`
 * and starts scanning there. The period index used for interval activeness
 * (`periodIndex % interval === 0`) is always the index **from the anchor**, so
 * block/month/year activeness is unchanged after the jump.
 *
 * @param rule The recurrence rule to expand.
 * @param anchorISO The anchor instant (ISO 8601). Defines the recurrence's
 *   reference Y/M/D and the UTC time-of-day inherited by every occurrence.
 * @param count Maximum number of occurrences to return (>= 0).
 * @param opts.fromISO Lower bound — only occurrences strictly after this
 *   instant are emitted. Defaults to the anchor.
 * @returns Up to `count` ISO strings in ascending order. Fewer only if the
 *   internal safety cap is reached before `count` valid occurrences are found.
 */
export function expandOccurrences(
  rule: RepetitionRule,
  anchorISO: string,
  count: number,
  opts?: { fromISO?: string }
): string[] {
  if (count <= 0) {
    return [];
  }

  const anchor = new Date(anchorISO);
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const anchorDay = anchor.getUTCDate();
  const anchorWeekday = anchor.getUTCDay();

  const time: TimeOfDay = {
    hours: anchor.getUTCHours(),
    minutes: anchor.getUTCMinutes(),
    seconds: anchor.getUTCSeconds(),
    ms: anchor.getUTCMilliseconds(),
  };

  // Strictly-after boundary as an epoch-ms threshold.
  const fromMs = new Date(opts?.fromISO ?? anchorISO).getTime();
  const anchorMs = anchor.getTime();

  const interval = rule.interval >= 1 ? rule.interval : 1;
  const results: string[] = [];

  /** Emit a candidate ISO if it is strictly after `from`; dedupe identical instants. */
  const consider = (iso: string | null): void => {
    if (iso === null) {
      return;
    }
    if (new Date(iso).getTime() <= fromMs) {
      return;
    }
    if (results.length > 0 && results[results.length - 1] === iso) {
      return;
    }
    results.push(iso);
  };

  switch (rule.frequency) {
    case "daily": {
      // Use midnight-UTC of the anchor day as the base for day-offset arithmetic.
      // This avoids passing a large raw day-of-month into makeISO (which validates
      // Y/M/D round-trips and would reject the value because the month overflows).
      const anchorMidnight = midnightUTC(anchorYear, anchorMonth, anchorDay);

      // Skip-ahead: estimate how many days separate the anchor from `from`, then
      // back off by 1 to avoid missing the first occurrence on the boundary day.
      // k is anchor-relative so k * interval remains correct after the jump.
      const daysAhead = Math.max(
        0,
        Math.floor((fromMs - anchorMs) / MS_PER_DAY) - 1
      );
      // Round down to the nearest multiple of interval so activeness is preserved.
      const startK = Math.floor(daysAhead / interval) * interval;
      for (
        let k = startK + interval;
        k <= startK + interval + MAX_PERIODS * interval && results.length < count;
        k += interval
      ) {
        consider(makeISOFromOffset(anchorMidnight, k, time));
      }
      break;
    }

    case "weekly": {
      // FIX (Bug 1): sort by offsetFromMonday so days are emitted in
      // chronological order within a Mon-started week (Mon=0…Sun=6), NOT by
      // raw weekday number (which would put Sunday=0 first — chronologically last).
      const days =
        rule.daysOfWeek && rule.daysOfWeek.length > 0
          ? [...rule.daysOfWeek].sort(
              (a, b) => offsetFromMonday(a) - offsetFromMonday(b)
            )
          : [anchorWeekday];

      // Midnight-UTC of the Monday that starts the anchor's week (WKST=Monday).
      // Using epoch-ms arithmetic avoids large day-of-month values in makeISO.
      const anchorMidnight = midnightUTC(anchorYear, anchorMonth, anchorDay);
      const anchorMondayMidnight =
        anchorMidnight - offsetFromMonday(anchorWeekday) * MS_PER_DAY;

      // Skip-ahead: estimate week-blocks between anchor and `from`.
      const weeksAhead = Math.max(
        0,
        Math.floor((fromMs - anchorMs) / (7 * MS_PER_DAY)) - 1
      );
      // Round down to nearest active block start (preserves interval activeness).
      const startW = Math.floor(weeksAhead / interval) * interval;

      for (
        let w = startW;
        w < startW + MAX_PERIODS * interval && results.length < count;
        w++
      ) {
        if (w % interval !== 0) {
          continue;
        }
        // Day-offset from anchorMondayMidnight to the Monday of this block.
        const blockMondayOffset = 7 * w;
        for (const weekday of days) {
          if (results.length >= count) {
            break;
          }
          consider(
            makeISOFromOffset(
              anchorMondayMidnight,
              blockMondayOffset + offsetFromMonday(weekday),
              time
            )
          );
        }
      }
      break;
    }

    case "monthly": {
      // Skip-ahead: estimate months between anchor and `from`.
      const fromDate = new Date(fromMs);
      const monthsAhead = Math.max(
        0,
        (fromDate.getUTCFullYear() - anchorYear) * 12 +
          (fromDate.getUTCMonth() - anchorMonth) -
          1
      );
      // Round down to nearest active month start.
      const startM = Math.floor(monthsAhead / interval) * interval;

      for (
        let m = startM;
        m < startM + MAX_PERIODS * interval && results.length < count;
        m++
      ) {
        if (m % interval !== 0) {
          continue;
        }
        const year = anchorYear + Math.floor((anchorMonth + m) / 12);
        const month = (anchorMonth + m) % 12;
        const candidates = monthCandidates(rule, year, month, anchorDay, time);
        for (const iso of candidates) {
          if (results.length >= count) {
            break;
          }
          consider(iso);
        }
      }
      break;
    }

    case "yearly": {
      const months =
        rule.monthsOfYear && rule.monthsOfYear.length > 0
          ? [...rule.monthsOfYear].sort((a, b) => a - b)
          : [anchorMonth + 1]; // monthsOfYear is 1-based (1=Jan)

      // Skip-ahead: estimate years between anchor and `from`.
      const fromDate = new Date(fromMs);
      const yearsAhead = Math.max(
        0,
        fromDate.getUTCFullYear() - anchorYear - 1
      );
      // Round down to nearest active year start.
      const startY = Math.floor(yearsAhead / interval) * interval;

      for (
        let y = startY;
        y < startY + MAX_PERIODS * interval && results.length < count;
        y++
      ) {
        if (y % interval !== 0) {
          continue;
        }
        const year = anchorYear + y;
        for (const month1 of months) {
          if (results.length >= count) {
            break;
          }
          const month = month1 - 1; // back to 0-indexed
          const candidates = monthCandidates(
            rule,
            year,
            month,
            anchorDay,
            time
          );
          for (const iso of candidates) {
            if (results.length >= count) {
              break;
            }
            consider(iso);
          }
        }
      }
      break;
    }
  }

  return results;
}
