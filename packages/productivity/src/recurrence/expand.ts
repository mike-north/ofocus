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
 * Upper bound on how many periods (days / weeks / months / years, depending on
 * frequency) we will scan before giving up. Guards against pathological rules
 * that never produce `count` occurrences (e.g. an impossible BYMONTHDAY). When
 * the cap is reached we return whatever has been collected so far.
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
 * Monday=0..Sunday=6. Used for week stepping with WKST=Monday.
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

/**
 * Enumerate the next `count` occurrences of `rule`, anchored at `anchorISO`,
 * that fall strictly after the `from` boundary (default: the anchor itself).
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
      for (let k = 1; k <= MAX_PERIODS && results.length < count; k++) {
        consider(
          makeISO(anchorYear, anchorMonth, anchorDay + k * interval, time)
        );
      }
      break;
    }

    case "weekly": {
      const days =
        rule.daysOfWeek && rule.daysOfWeek.length > 0
          ? [...rule.daysOfWeek].sort((a, b) => a - b)
          : [anchorWeekday];

      // Monday of the anchor's UTC week (WKST=Monday).
      const anchorMondayDay = anchorDay - offsetFromMonday(anchorWeekday);

      for (let w = 0; w < MAX_PERIODS && results.length < count; w++) {
        if (w % interval !== 0) {
          continue;
        }
        // This block's Monday: anchor's Monday + 7*w days.
        const blockMondayDay = anchorMondayDay + 7 * w;
        for (const weekday of days) {
          if (results.length >= count) {
            break;
          }
          consider(
            makeISO(
              anchorYear,
              anchorMonth,
              blockMondayDay + offsetFromMonday(weekday),
              time
            )
          );
        }
      }
      break;
    }

    case "monthly": {
      for (let m = 0; m < MAX_PERIODS && results.length < count; m++) {
        if (m % interval !== 0) {
          continue;
        }
        const year = anchorYear + Math.floor((anchorMonth + m) / 12);
        const month = (anchorMonth + m) % 12;
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
      break;
    }

    case "yearly": {
      const months =
        rule.monthsOfYear && rule.monthsOfYear.length > 0
          ? [...rule.monthsOfYear].sort((a, b) => a - b)
          : [anchorMonth + 1]; // monthsOfYear is 1-based (1=Jan)

      for (let y = 0; y < MAX_PERIODS && results.length < count; y++) {
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
