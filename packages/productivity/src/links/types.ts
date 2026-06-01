/**
 * Shared types for task↔calendar-event linkage (A4b).
 *
 * `ofocus` never reads a calendar — every {@link EventSnapshot} is supplied by
 * the agent from its own calendar tool. These types model the stored links and
 * the inputs/outputs of the deterministic readiness/coverage computations.
 *
 * @see docs/superpowers/specs/2026-06-01-ofocus-calendar-conversance-design.md
 */
import type { DurationInfo } from "../recurrence/duration.js";

/**
 * The kind of task↔event relationship.
 *
 * @public
 */
export type LinkType = "prep-for" | "time-block";

/**
 * Agent-supplied event data, as accepted by the `link`/`readiness` commands (no `capturedAt`).
 *
 * @public
 */
export interface EventInput {
  /** Stable id from the agent's calendar source. */
  eventId: string;
  title: string;
  /** Event start (ISO 8601). */
  start: string;
  /** Event end (ISO 8601). */
  end: string;
  location?: string;
  /** Optional provenance, e.g. "google" | "ms365". */
  source?: string;
}

/**
 * A stored event snapshot: an {@link EventInput} plus when the agent supplied it.
 *
 * @public
 */
export interface EventSnapshot extends EventInput {
  /** When the agent supplied this snapshot (ISO 8601). */
  capturedAt: string;
}

/**
 * A persisted task↔event link. Identity is `${taskId}::${linkType}::${event.eventId}`.
 *
 * @public
 */
export interface TaskEventLink {
  taskId: string;
  linkType: LinkType;
  event: EventSnapshot;
  note?: string;
  /** When the link was first created (ISO 8601). */
  createdAt: string;
}

/**
 * Live state of a single OmniFocus task, read by id.
 *
 * @public
 */
export interface TaskState {
  taskId: string;
  name: string;
  completed: boolean;
  /** Estimated minutes, or `null` when unset. */
  estimatedMinutes: number | null;
  /** Due date (ISO 8601), or `null`. */
  dueDate: string | null;
}

/**
 * Whether a stored event snapshot can still be trusted.
 *
 * @public
 */
export interface RefreshStatus {
  needsRefresh: boolean;
  reason?: string;
}

/**
 * Does a time-block reserve enough time for the task's estimate?
 *
 * @public
 */
export interface BlockCoverage {
  blockMinutes: number;
  /** The task's estimated duration in minutes (mirrors TaskState.estimatedMinutes), or null when unset. */
  estimateMinutes: number | null;
  covers: boolean;
}

/**
 * Per-task readiness within an event.
 *
 * @public
 */
export interface PrepTaskReadiness {
  taskId: string;
  /** Task name, or `null` when the task no longer exists. */
  name: string | null;
  status: "done" | "pending";
  /** True when the linked task no longer exists in OmniFocus. */
  taskMissing: boolean;
  /** Time from `now` until the event, or `null` if the event is past or the task is done. */
  timeUntilEvent: DurationInfo | null;
  /** When this prep task should be finished (event.start − estimate), or `null` without an estimate. */
  suggestedDue: string | null;
  /** True when the task's due date is absent or later than `suggestedDue`. */
  late: boolean;
}

/**
 * Overall verdict for an event's preparation.
 *
 * @public
 */
export type ReadinessVerdict = "ready" | "not-ready" | "at-risk";

/**
 * Result of the `readiness` command.
 *
 * @public
 */
export interface ReadinessResult {
  eventId: string;
  verdict: ReadinessVerdict;
  /** Count of prep tasks that are completed. */
  done: number;
  /** Total prep tasks. */
  total: number;
  tasks: PrepTaskReadiness[];
  refresh: RefreshStatus;
}

/**
 * One prep task and its (possibly missing) live state, fed into {@link readiness}.
 *
 * @public
 */
export interface PrepEntry {
  taskId: string;
  state: TaskState | null;
}
