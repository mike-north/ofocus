/**
 * Pure, deterministic computations over task↔event links: snapshot staleness,
 * lead-time / suggested due, time-block coverage, and the meeting-readiness
 * verdict. No I/O; `now` is always injected as an ISO string.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md §3.3
 */
import { dueIn } from "../recurrence/duration.js";
import type {
  EventSnapshot,
  PrepEntry,
  PrepTaskReadiness,
  ReadinessResult,
  ReadinessVerdict,
  RefreshStatus,
  TaskEventLink,
  BlockCoverage,
} from "./types.js";

const MS_PER_MINUTE = 60_000;
/** A snapshot older than this is considered stale and worth re-supplying. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
/** When an event is within this window and prep remains, readiness is at-risk. */
const NEAR_TERM_MS = 2 * 60 * 60 * 1000;

/**
 * When (event.start − estimate) falls, or `null` when no estimate / bad date.
 *
 * @public
 */
export function suggestedDue(
  eventStart: string,
  estimatedMinutes: number | null,
): string | null {
  if (estimatedMinutes === null) return null;
  const startMs = Date.parse(eventStart);
  if (Number.isNaN(startMs)) return null;
  return new Date(startMs - estimatedMinutes * MS_PER_MINUTE).toISOString();
}

/**
 * Whether a time-block reserves at least the task's estimated minutes.
 *
 * @public
 */
export function blockCoverage(
  event: EventSnapshot,
  estimatedMinutes: number | null,
): BlockCoverage {
  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  const blockMinutes =
    Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 0
      : Math.max(0, Math.round((endMs - startMs) / MS_PER_MINUTE));
  return {
    blockMinutes,
    estimateMinutes: estimatedMinutes,
    covers: estimatedMinutes === null ? false : blockMinutes >= estimatedMinutes,
  };
}

/**
 * Whether a stored snapshot for `event` can still be trusted, given `now` and
 * whether the related task is still open. Stale when the snapshot is older than
 * 24h, or the event start is in the past while the task remains actionable
 * (the event may have moved).
 *
 * @public
 */
export function eventNeedsRefresh(
  event: EventSnapshot,
  now: string,
  taskOpen: boolean,
): RefreshStatus {
  const nowMs = Date.parse(now);
  const capturedMs = Date.parse(event.capturedAt);
  const startMs = Date.parse(event.start);
  if (
    !Number.isNaN(nowMs) &&
    !Number.isNaN(capturedMs) &&
    nowMs - capturedMs > STALE_THRESHOLD_MS
  ) {
    return {
      needsRefresh: true,
      reason: "snapshot older than 24h; re-supply current event data",
    };
  }
  if (
    taskOpen &&
    !Number.isNaN(nowMs) &&
    !Number.isNaN(startMs) &&
    startMs < nowMs
  ) {
    return {
      needsRefresh: true,
      reason:
        "event start is in the past while prep is open; it may have moved — re-supply current event data",
    };
  }
  return { needsRefresh: false };
}

/**
 * Convenience wrapper of {@link eventNeedsRefresh} for a stored link.
 *
 * @public
 */
export function needsRefresh(
  link: TaskEventLink,
  now: string,
  taskOpen = true,
): RefreshStatus {
  return eventNeedsRefresh(link.event, now, taskOpen);
}

/**
 * Meeting-readiness verdict for an event's prep tasks (spec §3.3).
 *
 * @public
 */
export function readiness(
  event: EventSnapshot,
  entries: PrepEntry[],
  now: string,
): ReadinessResult {
  const tasks: PrepTaskReadiness[] = entries.map((e) => {
    if (e.state === null) {
      return {
        taskId: e.taskId,
        name: null,
        status: "pending",
        taskMissing: true,
        timeUntilEvent: dueIn(event.start, now),
        suggestedDue: null,
        late: false,
      };
    }
    const sd = suggestedDue(event.start, e.state.estimatedMinutes);
    const done = e.state.completed;
    const late =
      !done && sd !== null && (e.state.dueDate === null || e.state.dueDate > sd);
    return {
      taskId: e.taskId,
      name: e.state.name,
      status: done ? "done" : "pending",
      taskMissing: false,
      timeUntilEvent: done ? null : dueIn(event.start, now),
      suggestedDue: sd,
      late,
    };
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const anyOpen = tasks.some((t) => t.status === "pending");
  const refresh = eventNeedsRefresh(event, now, anyOpen);

  let verdict: ReadinessVerdict;
  if (!anyOpen) {
    verdict = "ready";
  } else {
    const nowMs = Date.parse(now);
    const startMs = Date.parse(event.start);
    const pastSuggested = tasks.some(
      (t) => t.status === "pending" && t.suggestedDue !== null && now >= t.suggestedDue,
    );
    const nearTerm =
      !Number.isNaN(nowMs) &&
      !Number.isNaN(startMs) &&
      startMs - nowMs <= NEAR_TERM_MS;
    verdict = pastSuggested || nearTerm ? "at-risk" : "not-ready";
  }

  return { eventId: event.eventId, verdict, done, total, tasks, refresh };
}
