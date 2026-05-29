/**
 * Helpers for building OmniJS repetition-rule expressions.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
import { z } from "zod";
import type { RepetitionRule } from "../types.js";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateRepetitionRule } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/** Map from 0-indexed weekday (Sunday=0) to RFC 5545 day abbreviation. */
const DAY_MAP: Record<number, string> = {
  0: "SU",
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
};

/**
 * Build an iCalendar RRULE string from a RepetitionRule.
 *
 * The output is the value passed as the first argument of
 * `new Task.RepetitionRule(ruleString, method)` inside an OmniJS script.
 * The `repeatMethod` field is intentionally *not* encoded here — it maps
 * to the second constructor argument via {@link repeatMethodToOmniJS}.
 *
 * Supported RRULE combinations:
 * - FREQ=DAILY[;INTERVAL=N]
 * - FREQ=WEEKLY[;INTERVAL=N][;BYDAY=MO,WE,...]
 * - FREQ=MONTHLY[;INTERVAL=N][;BYMONTHDAY=15]
 * - FREQ=MONTHLY[;INTERVAL=N][;BYDAY=1MO,-1MO,...]  (Nth-weekday form)
 * - FREQ=YEARLY[;INTERVAL=N][;BYMONTH=3,6][;BYMONTHDAY=25]
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 */
export function buildRRule(rule: RepetitionRule): string {
  const parts: string[] = [];

  const freqMap = {
    daily: "DAILY",
    weekly: "WEEKLY",
    monthly: "MONTHLY",
    yearly: "YEARLY",
  } as const;
  parts.push(`FREQ=${freqMap[rule.frequency]}`);

  if (rule.interval > 1) {
    parts.push(`INTERVAL=${String(rule.interval)}`);
  }

  if (rule.daysOfWeekPositions && rule.daysOfWeekPositions.length > 0) {
    // Positional Nth-weekday form: cross-product of positions × days.
    // Positions are the outer loop so output is stable:
    //   [1,-1] × [MO,WE] → 1MO,1WE,-1MO,-1WE
    const bydayValues: string[] = [];
    for (const pos of rule.daysOfWeekPositions) {
      for (const day of rule.daysOfWeek ?? []) {
        bydayValues.push(`${String(pos)}${DAY_MAP[day] ?? ""}`);
      }
    }
    // Deduplicate while preserving order
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const v of bydayValues) {
      if (!seen.has(v)) {
        seen.add(v);
        deduped.push(v);
      }
    }
    if (deduped.length > 0) {
      parts.push(`BYDAY=${deduped.join(",")}`);
    }
  } else if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    // Plain day list (no positional prefix)
    const days = rule.daysOfWeek.map((d) => DAY_MAP[d] ?? "").join(",");
    parts.push(`BYDAY=${days}`);
  }

  // BYMONTH before BYMONTHDAY — natural reading order (month, then day-in-month)
  if (rule.monthsOfYear && rule.monthsOfYear.length > 0) {
    parts.push(`BYMONTH=${rule.monthsOfYear.join(",")}`);
  }

  if (rule.dayOfMonth !== undefined) {
    parts.push(`BYMONTHDAY=${String(rule.dayOfMonth)}`);
  }

  return parts.join(";");
}

/**
 * Map a `RepetitionRule["repeatMethod"]` value to the OmniJS
 * `Task.RepetitionMethod.*` expression string used in the second argument
 * of `new Task.RepetitionRule(ruleString, method)`.
 *
 * | SDK value        | OmniJS constant                     | Meaning                          |
 * |------------------|-------------------------------------|----------------------------------|
 * | `"due-again"`    | `Task.RepetitionMethod.DueDate`     | Reschedules from completed date  |
 * | `"defer-another"`| `Task.RepetitionMethod.Start`       | Reschedules from defer date      |
 * | `"scheduled"`    | `Task.RepetitionMethod.Fixed`       | Strict cadence, date-fixed       |
 *
 * @returns A JS expression string suitable for splicing into an OmniJS body.
 *
 * @public
 */
export function repeatMethodToOmniJS(
  method: RepetitionRule["repeatMethod"]
): string {
  switch (method) {
    case "due-again":
      return "Task.RepetitionMethod.DueDate";
    case "defer-another":
      return "Task.RepetitionMethod.Start";
    case "scheduled":
      return "Task.RepetitionMethod.Fixed";
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Result from applying a repetition rule to a task.
 * @public
 */
export interface ApplyRepetitionRuleResult {
  id: string;
  ruleString: string;
  method: string;
}

/**
 * Result from clearing a repetition rule from a task.
 * @public
 */
export interface ClearRepetitionRuleResult {
  id: string;
}

// ---------------------------------------------------------------------------
// applyRepetitionRule
// ---------------------------------------------------------------------------

/**
 * Apply a repetition rule to an existing task.
 *
 * @param taskId - ID of the task to update.
 * @param rule   - The repetition rule to apply.
 */
export async function applyRepetitionRule(
  taskId: string,
  rule: RepetitionRule
): Promise<CliOutput<ApplyRepetitionRuleResult>> {
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const ruleError = validateRepetitionRule(rule);
  if (ruleError) return failure(ruleError);

  const rrule = buildRRule(rule);
  const method = repeatMethodToOmniJS(rule.repeatMethod);

  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});
return JSON.stringify({
  id: task.id.primaryKey,
  ruleString: task.repetitionRule ? task.repetitionRule.ruleString : "${escapeJSString(rrule)}",
  method: "${escapeJSString(method)}"
});`;

  const result = await runOmniJSWrapped<ApplyRepetitionRuleResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to apply repetition rule")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

// ---------------------------------------------------------------------------
// clearRepetitionRule
// ---------------------------------------------------------------------------

/**
 * Clear the repetition rule from an existing task.
 *
 * @param taskId - ID of the task to update.
 */
export async function clearRepetitionRule(
  taskId: string
): Promise<CliOutput<ClearRepetitionRuleResult>> {
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
task.repetitionRule = null;
return JSON.stringify({ id: task.id.primaryKey });`;

  const result = await runOmniJSWrapped<ClearRepetitionRuleResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to clear repetition rule")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

// ---------------------------------------------------------------------------
// Command descriptors
// ---------------------------------------------------------------------------

const repetitionRuleInputSchema = z.object({
  taskId: z.string().describe("ID of the task to update"),
  frequency: z
    .enum(["daily", "weekly", "monthly", "yearly"])
    .describe("Repeat frequency"),
  interval: z
    .number()
    .int()
    .min(1)
    .describe("Repeat every N periods (default: 1)")
    .default(1),
  repeatMethod: z
    .enum(["due-again", "defer-another", "scheduled"])
    .describe(
      "How to reschedule: due-again (from completion), defer-another (from defer date), scheduled (fixed cadence)"
    )
    .default("due-again"),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .describe("Days of week (0=Sunday, 6=Saturday)"),
  dayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Day of month (1-31) for monthly recurrences"),
  daysOfWeekPositions: z
    .array(z.number().int())
    .optional()
    .describe(
      "Positional prefixes for Nth-weekday monthly rules, e.g. [1,-1] for first and last. Values in [-5,-1]∪[1,5]."
    ),
  monthsOfYear: z
    .array(z.number().int().min(1).max(12))
    .optional()
    .describe("Months of year (1=January, 12=December) for yearly recurrences"),
});

/**
 * Centralized descriptor for the `apply-repetition` command.
 *
 * Drives the CLI subcommand `apply-repetition` and the MCP tool
 * `task_apply_repetition`.
 *
 * @public
 */
export const applyRepetitionRuleDescriptor = defineCommand({
  name: "applyRepetitionRule",
  cliName: "apply-repetition",
  mcpName: "task_apply_repetition",
  description:
    "Apply a repetition rule to an existing task. Supports daily, weekly (with BYDAY), monthly (by day-of-month or Nth-weekday), and yearly (with BYMONTH) recurrences.",
  cliPositional: ["taskId"],
  inputSchema: repetitionRuleInputSchema,
  handler: async (input) => {
    const rule: RepetitionRule = {
      frequency: input.frequency,
      interval: input.interval,
      repeatMethod: input.repeatMethod,
      daysOfWeek: input.daysOfWeek,
      dayOfMonth: input.dayOfMonth,
      daysOfWeekPositions: input.daysOfWeekPositions,
      monthsOfYear: input.monthsOfYear,
    };
    return applyRepetitionRule(input.taskId, rule);
  },
});

/**
 * Centralized descriptor for the `clear-repetition` command.
 *
 * Drives the CLI subcommand `clear-repetition` and the MCP tool
 * `task_clear_repetition`.
 *
 * @public
 */
export const clearRepetitionRuleDescriptor = defineCommand({
  name: "clearRepetitionRule",
  cliName: "clear-repetition",
  mcpName: "task_clear_repetition",
  description: "Clear the repetition rule from an existing task.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z
      .string()
      .describe("ID of the task to clear the repetition rule from"),
  }),
  handler: async (input) => clearRepetitionRule(input.taskId),
});
