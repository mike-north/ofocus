/**
 * `occurrences` — project every incomplete repeating task forward over a time
 * window and return a flattened, ascending list of upcoming occurrences.
 *
 * Whereas `next-occurrences` answers "what are the next N dates for *one*
 * task?", `occurrences` answers "what is coming up across *all* my repeating
 * tasks in the next N days?". It scans every incomplete repeating task
 * ({@link scanRepeatingTasks}), parses each RRULE ({@link parseRRule}),
 * expands it within the window ({@link expandOccurrences}), and annotates each
 * occurrence with the time remaining ({@link dueIn}).
 *
 * Scope filters (project/tag) are intentionally OUT of scope for v1:
 * `occurrences` covers every incomplete repeating task in the database.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { z } from "zod";
import {
  type CliOutput,
  type RepetitionRule,
  ErrorCode,
  createError,
  defineCommand,
  failure,
  success,
} from "@ofocus/sdk";
import { type DurationInfo, dueIn } from "../recurrence/duration.js";
import { expandOccurrences } from "../recurrence/expand.js";
import { parseRRule } from "../recurrence/parse.js";
import {
  type OmniRepeatMethod,
  type TaskRule,
  scanRepeatingTasks,
} from "../recurrence/scan-rule.js";

/** Default window length, in days, when `days` is omitted. */
const DEFAULT_DAYS = 14;

/** Milliseconds in a day, used to advance the window end from `now`. */
const MS_PER_DAY = 86_400_000;

/** A single projected occurrence of a repeating task within the window. */
export interface Occurrence {
  /** The task's primary-key id. */
  taskId: string;
  /** The task's name. */
  name: string;
  /** The projected occurrence instant (ISO 8601). */
  occurrenceDate: string;
  /** Time from `now` until this occurrence, or `null` if at/before now. */
  dueIn: DurationInfo | null;
}

/** The time window the projection covers. */
export interface OccurrencesWindow {
  /** Window start (inclusive lower bound; the injected `now`). */
  from: string;
  /** Window end (inclusive upper bound; `now` + `days`). */
  until: string;
  /** Window length in days. */
  days: number;
}

/**
 * Result of the `occurrences` command.
 *
 * @public
 */
export interface OccurrencesOutput {
  /** The window the projection covers. */
  window: OccurrencesWindow;
  /** Number of occurrences in {@link OccurrencesOutput.occurrences}. */
  count: number;
  /** All projected occurrences, flattened across tasks, ascending by date. */
  occurrences: Occurrence[];
}

/**
 * Map an OmniFocus repeat method to a {@link RepetitionRule} repeat method.
 *
 * `null` (a repeating task without a resolvable method) defaults to
 * `"due-again"`, matching the most common schedule-anchored behaviour. Mirrors
 * the mapping in `next-occurrences`.
 */
function methodMap(
  method: OmniRepeatMethod | null,
): RepetitionRule["repeatMethod"] {
  switch (method) {
    case "Start":
      return "defer-another";
    case "Fixed":
      return "scheduled";
    case "DueDate":
    case null:
      return "due-again";
  }
}

/** Dependencies injected for testing; the descriptor passes real implementations. */
export interface OccurrencesDeps {
  /** Scans every incomplete repeating task. */
  scanRepeatingTasks: () => Promise<TaskRule[]>;
  /** The current instant as an ISO 8601 string (injected for determinism). */
  now: string;
}

/** Input accepted by {@link runOccurrences}. */
export interface OccurrencesInput {
  // `| undefined` to match the `z.infer` of the descriptor schema under
  // exactOptionalPropertyTypes (optional zod fields infer as `T | undefined`).
  days?: number | undefined;
}

/**
 * Core handler. `deps` is injected in tests; the descriptor passes the real
 * `scanRepeatingTasks` and `new Date().toISOString()`.
 */
export async function runOccurrences(
  input: OccurrencesInput,
  deps: OccurrencesDeps,
): Promise<CliOutput<OccurrencesOutput>> {
  const days = input.days ?? DEFAULT_DAYS;
  if (!Number.isInteger(days) || days <= 0) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        `days must be a positive integer, got: ${String(input.days)}`,
      ),
    );
  }

  const fromISO = deps.now;
  const fromMs = Date.parse(fromISO);
  if (Number.isNaN(fromMs)) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, `Invalid now instant: ${fromISO}`),
    );
  }
  // Inclusive end of the window: now + days (UTC).
  const untilISO = new Date(fromMs + days * MS_PER_DAY).toISOString();

  const tasks = await deps.scanRepeatingTasks();

  const occurrences: Occurrence[] = [];
  for (const task of tasks) {
    // Skip tasks without a parseable repetition rule.
    if (task.ruleString === null) {
      continue;
    }
    const parsed = parseRRule(task.ruleString, methodMap(task.method));
    if (parsed === null) {
      continue;
    }

    // Anchor selection mirrors next-occurrences: due/defer grid origin, else now.
    const anchor = task.dueDate ?? task.deferDate ?? fromISO;

    // expandOccurrences emits dates strictly after `fromISO`; request a few
    // extra (`days + 2`) so day-grained rules can't be starved at the boundary,
    // then trim to the inclusive window end ourselves.
    const dates = expandOccurrences(parsed, anchor, days + 2, { fromISO });
    for (const date of dates) {
      if (date <= untilISO) {
        occurrences.push({
          taskId: task.id,
          name: task.name,
          occurrenceDate: date,
          dueIn: dueIn(date, fromISO),
        });
      }
    }
  }

  // Flatten across tasks: ascending by occurrence date (lexical compare is
  // correct for canonical ISO 8601 UTC instants).
  occurrences.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));

  return success({
    window: { from: fromISO, until: untilISO, days },
    count: occurrences.length,
    occurrences,
  });
}

/**
 * Centralized descriptor for the `occurrences` command.
 *
 * Drives the CLI subcommand `occurrences` and the MCP tool `occurrences`;
 * docs + catalog pick it up from `productivityDescriptors`.
 *
 * @public
 */
export const occurrencesDescriptor = defineCommand({
  name: "occurrences",
  cliName: "occurrences",
  mcpName: "occurrences",
  description:
    "Project every incomplete repeating task forward over a window and list " +
    "the upcoming occurrences, ascending by date.",
  cliPositional: [],
  inputSchema: z.object({
    days: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Window length in days (default 14)"),
  }),
  handler: async (parsed): Promise<CliOutput<OccurrencesOutput>> =>
    runOccurrences(parsed, {
      scanRepeatingTasks,
      now: new Date().toISOString(),
    }),
});
