/**
 * Pure duration helpers for the temporal engine.
 *
 * Computes the gap between a target instant and a reference "now" instant,
 * expressed as a structured {@link DurationInfo}. Both inputs are ISO 8601
 * strings; these functions never read the system clock, so callers must supply
 * `nowISO` explicitly to keep them deterministic and testable.
 */

/** Number of minutes in a day. */
const MINUTES_PER_DAY = 1440;
/** Number of minutes in an hour. */
const MINUTES_PER_HOUR = 60;
/** Number of milliseconds in a minute. */
const MS_PER_MINUTE = 60000;

/**
 * A duration broken down into days/hours/minutes plus a human-readable label.
 *
 * @public
 */
export interface DurationInfo {
  /** Total whole minutes in the duration (rounded). */
  totalMinutes: number;
  /** Whole days component. */
  days: number;
  /** Whole hours component (0–23). */
  hours: number;
  /** Whole minutes component (0–59). */
  minutes: number;
  /** Compact human-readable label, e.g. `"2d 3h"`, `"5h 10m"`, `"45m"`. */
  humanized: string;
}

/**
 * Convert a positive millisecond span into a {@link DurationInfo}.
 *
 * The humanized label keeps at most the two most-significant non-zero units:
 * - days present → `"{days}d"` plus `" {hours}h"` only when hours > 0
 * - else hours present → `"{hours}h"` plus `" {minutes}m"` only when minutes > 0
 * - else → `"{minutes}m"`
 */
function durationFromMs(ms: number): DurationInfo {
  const totalMinutes = Math.round(ms / MS_PER_MINUTE);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;

  let humanized: string;
  if (days > 0) {
    humanized = `${String(days)}d` + (hours > 0 ? ` ${String(hours)}h` : "");
  } else if (hours > 0) {
    humanized =
      `${String(hours)}h` + (minutes > 0 ? ` ${String(minutes)}m` : "");
  } else {
    humanized = `${String(minutes)}m`;
  }

  return { totalMinutes, days, hours, minutes, humanized };
}

/**
 * Parse an ISO 8601 string, returning `null` when it is absent or unparseable.
 */
function parseISO(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Duration from `nowISO` until `targetISO`.
 *
 * @param targetISO - The target instant (e.g. a due date), or `null` when absent.
 * @param nowISO - The reference "now" instant.
 * @returns The duration until the target, or `null` if `targetISO` is null/unparseable
 *   or the target is at or before now (in which case use {@link overdueBy}).
 *
 * @public
 */
export function dueIn(
  targetISO: string | null,
  nowISO: string
): DurationInfo | null {
  const target = parseISO(targetISO);
  const now = parseISO(nowISO);
  if (target === null || now === null) return null;
  if (target <= now) return null;
  return durationFromMs(target - now);
}

/**
 * Duration since `targetISO` elapsed, relative to `nowISO`.
 *
 * @param targetISO - The target instant (e.g. a due date), or `null` when absent.
 * @param nowISO - The reference "now" instant.
 * @returns The duration since the target, or `null` if `targetISO` is null/unparseable
 *   or the target is still in the future (in which case use {@link dueIn}).
 *
 * @public
 */
export function overdueBy(
  targetISO: string | null,
  nowISO: string
): DurationInfo | null {
  const target = parseISO(targetISO);
  const now = parseISO(nowISO);
  if (target === null || now === null) return null;
  if (target > now) return null;
  return durationFromMs(now - target);
}
