/**
 * `next-occurrences` — read a task's repetition rule and project its next
 * occurrence dates.
 *
 * The command reads the task's `repetitionRule` (RFC 5545 RRULE) plus its
 * scheduling anchors via {@link readTaskRule}, parses the RRULE with
 * {@link parseRRule}, and enumerates the next occurrences with
 * {@link expandOccurrences}.
 *
 * ## Predictability
 *
 * OmniFocus has three repeat methods. `Fixed` and `DueDate` are
 * *schedule-anchored*: the next dates follow a fixed grid derived from the
 * task's due/defer date, so they can be predicted ahead of time. `Start`
 * (defer-another) is *completion-anchored*: the next occurrence is computed
 * from when the task is actually completed, which is unknown until it happens.
 * For `Start` rules we therefore project from the supplied `from`, the last
 * completion date, or now, and flag the result as not predictable with a note.
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
import { expandOccurrences } from "../recurrence/expand.js";
import { parseRRule } from "../recurrence/parse.js";
import {
  type OmniRepeatMethod,
  type TaskRule,
  readTaskRule,
} from "../recurrence/scan-rule.js";

/** Note attached to completion-anchored (`Start`) projections. */
const START_PROJECTION_NOTE =
  "This is a completion-anchored repeat (OmniFocus 'Start' method): the next " +
  "due date is computed from when the task is actually completed, so these " +
  "dates are projected from the given/last/now anchor and may shift.";

/**
 * Result of the `next-occurrences` command.
 *
 * `repeating` is `false` for one-off tasks; in that case `occurrences` is
 * empty and the recurrence-specific fields are omitted. `parseable` is present
 * (and `false`) only when the task repeats but its RRULE could not be parsed.
 *
 * @public
 */
export interface NextOccurrencesOutput {
  /** The task's primary-key id (echoed from the input). */
  taskId: string;
  /** The task's name. */
  name: string;
  /** Whether the task has a repetition rule at all. */
  repeating: boolean;
  /** `false` when the task repeats but its RRULE could not be parsed. */
  parseable?: boolean;
  /** The normalized RepetitionRule repeat method, when the rule is parseable. */
  repeatMethod?: RepetitionRule["repeatMethod"];
  /** The raw OmniFocus repeat method, when the task repeats. */
  method?: OmniRepeatMethod | null;
  /** The ISO instant used as the recurrence grid origin, when expanded. */
  anchor?: string;
  /**
   * Whether these dates can be known ahead of time. `false` for `Start`
   * (completion-anchored) repeats.
   */
  predictable?: boolean;
  /** Explanatory note, present only for projected (`Start`) results. */
  note?: string;
  /** The raw RRULE string, present when the rule was unparseable. */
  ruleString?: string;
  /** The projected occurrence instants (ISO 8601), in ascending order. */
  occurrences: string[];
}

/**
 * Map an OmniFocus repeat method to a {@link RepetitionRule} repeat method.
 *
 * `null` (a repeating task without a resolvable method) defaults to
 * `"due-again"`, matching the most common schedule-anchored behaviour.
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
export interface NextOccurrencesDeps {
  /** Reads a task's repetition rule + anchors, or `null` if not found. */
  readTaskRule: (id: string) => Promise<TaskRule | null>;
  /** The current instant as an ISO 8601 string (injected for determinism). */
  now: string;
}

/** Input accepted by {@link runNextOccurrences}. */
export interface NextOccurrencesInput {
  taskId: string;
  // `| undefined` to match the `z.infer` of the descriptor schema under
  // exactOptionalPropertyTypes (optional zod fields infer as `T | undefined`).
  count?: number | undefined;
  from?: string | undefined;
}

const DEFAULT_COUNT = 5;

/**
 * Core handler. `deps` is injected in tests; the descriptor passes the real
 * `readTaskRule` and `new Date().toISOString()`.
 */
export async function runNextOccurrences(
  input: NextOccurrencesInput,
  deps: NextOccurrencesDeps,
): Promise<CliOutput<NextOccurrencesOutput>> {
  const rule = await deps.readTaskRule(input.taskId);
  if (rule === null) {
    return failure(
      createError(ErrorCode.TASK_NOT_FOUND, `Task not found: ${input.taskId}`),
    );
  }

  // Non-repeating task: nothing to project.
  if (rule.ruleString === null) {
    return success({
      taskId: input.taskId,
      name: rule.name,
      repeating: false,
      occurrences: [],
    });
  }

  const repeatMethod = methodMap(rule.method);
  const parsed = parseRRule(rule.ruleString, repeatMethod);
  if (parsed === null) {
    // Repeating, but the RRULE is outside the subset parseRRule understands.
    return success({
      taskId: input.taskId,
      name: rule.name,
      repeating: true,
      parseable: false,
      ruleString: rule.ruleString,
      occurrences: [],
    });
  }

  const count = input.count ?? DEFAULT_COUNT;
  // Fixed/DueDate are schedule-anchored (predictable); Start is
  // completion-anchored and cannot be known ahead of completion.
  const predictable = rule.method !== "Start";

  // Anchor selection:
  //  - schedule-anchored: the due/defer grid origin, falling back to now.
  //  - completion-anchored: the explicit `from`, else the last completion, else now.
  const anchor = predictable
    ? rule.dueDate ?? rule.deferDate ?? deps.now
    : input.from ?? rule.completionDate ?? deps.now;
  const fromISO = input.from ?? deps.now;

  const occurrences = expandOccurrences(parsed, anchor, count, { fromISO });

  // Build the output with conditional inclusion of `note` to satisfy
  // exactOptionalPropertyTypes (never assign `undefined` to an optional prop).
  const output: NextOccurrencesOutput = {
    taskId: input.taskId,
    name: rule.name,
    repeating: true,
    repeatMethod,
    method: rule.method,
    anchor,
    predictable,
    occurrences,
  };
  if (!predictable) {
    output.note = START_PROJECTION_NOTE;
  }
  return success(output);
}

/**
 * Centralized descriptor for the `next-occurrences` command.
 *
 * Drives the CLI subcommand `next-occurrences` and the MCP tool
 * `next_occurrences`; docs + catalog pick it up from `productivityDescriptors`.
 *
 * @public
 */
export const nextOccurrencesDescriptor = defineCommand({
  name: "nextOccurrences",
  cliName: "next-occurrences",
  mcpName: "next_occurrences",
  description:
    "Read a task's repetition rule and project its next occurrence dates. " +
    "Schedule-anchored repeats (Fixed/DueDate) are predictable; " +
    "completion-anchored repeats (Start) are projected and may shift.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task whose occurrences to project"),
    count: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("How many future occurrences (default 5)"),
    from: z
      .string()
      .optional()
      .describe("ISO date; only occurrences after this are returned (default now)"),
  }),
  handler: async (parsed): Promise<CliOutput<NextOccurrencesOutput>> =>
    runNextOccurrences(parsed, {
      readTaskRule,
      now: new Date().toISOString(),
    }),
});
