/**
 * `today` and `this-week` — composed digest commands.
 *
 * These commands compose existing SDK queries and annotate the results with
 * computed durations:
 *
 * - `today` partitions the open task set into three buckets — overdue, due
 *   today, and flagged — annotating each item with how overdue it is
 *   ({@link overdueBy}) or how soon it is due ({@link dueIn}).
 * - `this-week` groups the next seven days' forecast by UTC calendar day,
 *   annotating each task with the time until it is due.
 *
 * All heavy lifting (talking to OmniFocus) is pushed into injected fetchers so
 * the pure partition/group helpers are fully testable offline. Dates are
 * reasoned about against the UTC calendar; lexical comparison is correct for
 * canonical ISO 8601 UTC instants.
 */
import { z } from "zod";
import {
  type CliOutput,
  type OFTask,
  type QueryResult,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  queryForecast,
  queryTasks,
  success,
} from "@ofocus/sdk";
import { type DurationInfo, dueIn, overdueBy } from "../recurrence/duration.js";

/** Milliseconds in a day, used to advance the week window from `now`. */
const MS_PER_DAY = 86_400_000;

/** Length, in days, of the `this-week` forecast window. */
const WEEK_DAYS = 7;

/** Which bucket a {@link TodayItem} belongs to in the `today` digest. */
export type TodayBucket = "overdue" | "due-today" | "flagged";

/** A single annotated task in the `today` digest. */
export interface TodayItem {
  /** The task's primary-key id. */
  id: string;
  /** The task's name. */
  name: string;
  /** The task's due date (ISO 8601), or `null` when absent. */
  dueDate: string | null;
  /** The owning project's name, when the task belongs to a project. */
  projectName?: string | undefined;
  /**
   * Computed duration for the item: time overdue (overdue bucket), time until
   * due (due-today, or flagged-with-due), or `null` when no due date applies.
   */
  duration?: DurationInfo | null | undefined;
  /** Which bucket this item was sorted into. */
  bucket: TodayBucket;
}

/** A single annotated task in the `this-week` digest. */
export interface WeekItem {
  /** The task's primary-key id. */
  id: string;
  /** The task's name. */
  name: string;
  /** The task's due date (ISO 8601). Always non-null within a day group. */
  dueDate: string;
  /** Time from `now` until the task is due, or `null` if at/before now. */
  dueIn: DurationInfo | null;
}

/** Tasks grouped under a single UTC calendar day. */
export interface DayGroup {
  /** The UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Tasks due on that day, ascending by due date. */
  tasks: WeekItem[];
}

/** Result of the `today` command. */
export interface TodayDigest {
  /** The UTC calendar day (`YYYY-MM-DD`) the digest covers. */
  date: string;
  /** Per-bucket counts. */
  counts: { overdue: number; dueToday: number; flagged: number };
  /** Tasks that are past due. */
  overdue: TodayItem[];
  /** Tasks due later today. */
  dueToday: TodayItem[];
  /** Flagged tasks not already covered by the overdue/due-today buckets. */
  flagged: TodayItem[];
}

/** Result of the `this-week` command. */
export interface WeekDigest {
  /** Window start (the injected `now`, ISO 8601). */
  from: string;
  /** Window end (`now` + 7 days, ISO 8601). */
  until: string;
  /** Tasks grouped by UTC calendar day, ascending. */
  days: DayGroup[];
  /** Total number of tasks across all day groups. */
  count: number;
}

/**
 * `23:59:59.999Z` of the input instant's UTC calendar day.
 *
 * Used as the inclusive upper bound for "due today".
 */
export function endOfUtcDay(nowISO: string): string {
  const date = utcDateKey(nowISO);
  return `${date}T23:59:59.999Z`;
}

/** Extract the `YYYY-MM-DD` UTC calendar-day key from an ISO 8601 instant. */
function utcDateKey(iso: string): string {
  // Canonical ISO 8601 UTC instants always lead with `YYYY-MM-DD`.
  return iso.slice(0, 10);
}

/**
 * Partition open tasks into the `today` digest's three buckets.
 *
 * - **overdue**: not completed, has a due date, due strictly before `now`.
 * - **dueToday**: not completed, due at/after `now` and at/before
 *   `endOfTodayISO`.
 * - **flagged**: flagged, not completed, and not already captured by the
 *   overdue or due-today buckets (deduped by id).
 *
 * @param tasks - The candidate tasks.
 * @param nowISO - The reference "now" instant.
 * @param endOfTodayISO - Inclusive upper bound for "due today" (see
 *   {@link endOfUtcDay}).
 */
export function partitionToday(
  tasks: OFTask[],
  nowISO: string,
  endOfTodayISO: string,
): { overdue: TodayItem[]; dueToday: TodayItem[]; flagged: TodayItem[] } {
  const overdue: TodayItem[] = [];
  const dueToday: TodayItem[] = [];
  const flagged: TodayItem[] = [];
  // Ids placed in overdue/dueToday, so flagged can dedupe against them.
  const claimed = new Set<string>();

  for (const task of tasks) {
    if (task.completed) continue;

    const due = task.dueDate;
    if (due !== null && due < nowISO) {
      overdue.push(makeItem(task, "overdue", overdueBy(due, nowISO)));
      claimed.add(task.id);
      continue;
    }
    if (due !== null && due >= nowISO && due <= endOfTodayISO) {
      dueToday.push(makeItem(task, "due-today", dueIn(due, nowISO)));
      claimed.add(task.id);
      continue;
    }
  }

  // Second pass for flagged so dedupe is order-independent across the input.
  for (const task of tasks) {
    if (task.completed) continue;
    if (!task.flagged) continue;
    if (claimed.has(task.id)) continue;
    // A flagged task with a (future, beyond-today) due date still gets dueIn.
    flagged.push(makeItem(task, "flagged", dueIn(task.dueDate, nowISO)));
  }

  return { overdue, dueToday, flagged };
}

/** Build a {@link TodayItem} from a task, bucket, and computed duration. */
function makeItem(
  task: OFTask,
  bucket: TodayBucket,
  duration: DurationInfo | null,
): TodayItem {
  return {
    id: task.id,
    name: task.name,
    dueDate: task.dueDate,
    ...(task.projectName !== null ? { projectName: task.projectName } : {}),
    duration,
    bucket,
  };
}

/**
 * Group tasks by the UTC calendar day of their due date, ascending, with tasks
 * within a day ascending by due date. Tasks without a due date are excluded.
 *
 * @param tasks - The candidate tasks.
 * @param nowISO - The reference "now" instant, for the `dueIn` annotation.
 */
export function groupByDay(tasks: OFTask[], nowISO: string): DayGroup[] {
  const byDay = new Map<string, WeekItem[]>();

  for (const task of tasks) {
    const due = task.dueDate;
    if (due === null) continue;
    const key = utcDateKey(due);
    const item: WeekItem = {
      id: task.id,
      name: task.name,
      dueDate: due,
      dueIn: dueIn(due, nowISO),
    };
    const bucket = byDay.get(key);
    if (bucket === undefined) {
      byDay.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }

  return [...byDay.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const items = byDay.get(date) ?? [];
      items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return { date, tasks: items };
    });
}

/** Dependencies for {@link runToday}; the descriptor injects the real fetch. */
export interface TodayDeps {
  /** Fetches the candidate open tasks (overdue + due-today + flagged). */
  fetchTasks: () => Promise<OFTask[]>;
  /** The current instant as an ISO 8601 string (injected for determinism). */
  now: string;
}

/** Dependencies for {@link runThisWeek}; the descriptor injects the real fetch. */
export interface ThisWeekDeps {
  /** Fetches the next-7-days forecast tasks. */
  fetchForecast: () => Promise<OFTask[]>;
  /** The current instant as an ISO 8601 string (injected for determinism). */
  now: string;
}

/**
 * Core handler for `today`. `deps` is injected in tests; the descriptor passes
 * the real query-backed fetcher and `new Date().toISOString()`.
 */
export async function runToday(
  deps: TodayDeps,
): Promise<CliOutput<TodayDigest>> {
  const tasks = await deps.fetchTasks();
  const { overdue, dueToday, flagged } = partitionToday(
    tasks,
    deps.now,
    endOfUtcDay(deps.now),
  );

  return success({
    date: utcDateKey(deps.now),
    counts: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      flagged: flagged.length,
    },
    overdue,
    dueToday,
    flagged,
  });
}

/**
 * Core handler for `this-week`. `deps` is injected in tests; the descriptor
 * passes the real forecast-backed fetcher and `new Date().toISOString()`.
 */
export async function runThisWeek(
  deps: ThisWeekDeps,
): Promise<CliOutput<WeekDigest>> {
  const tasks = await deps.fetchForecast();
  const days = groupByDay(tasks, deps.now);
  const count = days.reduce((sum, group) => sum + group.tasks.length, 0);
  const fromMs = Date.parse(deps.now);
  const until = new Date(fromMs + WEEK_DAYS * MS_PER_DAY).toISOString();

  return success({ from: deps.now, until, days, count });
}

/**
 * Extract the item list from a {@link QueryResult}. The digest fetchers always
 * request the default (list) shape, so any other discriminant yields an empty
 * list rather than throwing.
 */
function itemsOf(result: QueryResult<OFTask>): OFTask[] {
  return result.kind === "list" ? result.items : [];
}

/**
 * Coerce a (possibly-null) {@link CliError} from a failed query into a concrete
 * failure envelope, falling back to a generic error when the SDK omitted one.
 */
function propagateFailure<T>(
  error: ReturnType<typeof createError> | null,
  message: string,
): CliOutput<T> {
  return failure<T>(error ?? createError(ErrorCode.UNKNOWN_ERROR, message));
}

/**
 * Centralized descriptor for the `today` command.
 *
 * Drives the CLI subcommand `today` and the MCP tool `today`. The real fetcher
 * unions (a) not-completed tasks due before end-of-today (overdue + due-today)
 * with (b) not-completed flagged tasks, deduping by id, and propagates any
 * query failure.
 *
 * @public
 */
export const todayDescriptor = defineCommand({
  name: "today",
  cliName: "today",
  mcpName: "today",
  description:
    "Digest of what needs attention today: overdue, due today, and flagged " +
    "tasks, each annotated with how overdue or how soon it is.",
  cliPositional: [],
  inputSchema: z.object({}),
  handler: async (): Promise<CliOutput<TodayDigest>> => {
    const now = new Date().toISOString();
    const dueResult = await queryTasks({
      notCompleted: true,
      dueBefore: endOfUtcDay(now),
      all: true,
    });
    if (!dueResult.success || dueResult.data === null) {
      return propagateFailure(dueResult.error, "Failed to query due tasks");
    }
    const flaggedResult = await queryTasks({
      notCompleted: true,
      flagged: true,
      all: true,
    });
    if (!flaggedResult.success || flaggedResult.data === null) {
      return propagateFailure(
        flaggedResult.error,
        "Failed to query flagged tasks",
      );
    }

    // Union the two result sets, deduping by id.
    const byId = new Map<string, OFTask>();
    for (const task of itemsOf(dueResult.data)) byId.set(task.id, task);
    for (const task of itemsOf(flaggedResult.data)) byId.set(task.id, task);

    return runToday({
      fetchTasks: () => Promise.resolve([...byId.values()]),
      now,
    });
  },
});

/**
 * Centralized descriptor for the `this-week` command.
 *
 * Drives the CLI subcommand `this-week` and the MCP tool `this_week`. The real
 * fetcher reads the seven-day forecast and propagates any query failure.
 *
 * @public
 */
export const thisWeekDescriptor = defineCommand({
  name: "thisWeek",
  cliName: "this-week",
  mcpName: "this_week",
  description:
    "Digest of tasks due over the next seven days, grouped by calendar day " +
    "and annotated with how soon each is due.",
  cliPositional: [],
  inputSchema: z.object({}),
  handler: async (): Promise<CliOutput<WeekDigest>> => {
    const now = new Date().toISOString();
    const result = await queryForecast({ days: WEEK_DAYS, all: true });
    if (!result.success || result.data === null) {
      return propagateFailure(result.error, "Failed to query forecast");
    }
    const tasks = itemsOf(result.data);
    return runThisWeek({
      fetchForecast: () => Promise.resolve(tasks),
      now,
    });
  },
});
