/**
 * OmniJS read of a single task's repetition rule and its scheduling anchors.
 *
 * A repeating task in OmniFocus exposes `task.repetitionRule.ruleString`
 * (an RFC 5545 RRULE fragment such as `"FREQ=WEEKLY;BYDAY=WE,FR"`) and
 * `task.repetitionRule.method`, one of
 * `Task.RepetitionMethod.{DueDate,Start,Fixed}`. This module reads those plus
 * the due/defer/completion anchors for one task.
 */
import { escapeJSString, runOmniJSWrapped } from "@ofocus/sdk";

/**
 * The repetition method as surfaced by OmniFocus, normalized to a string.
 *
 * @public
 */
export type OmniRepeatMethod = "DueDate" | "Start" | "Fixed";

/**
 * A task's repetition rule plus its scheduling anchor dates.
 *
 * @public
 */
export interface TaskRule {
  /** The task's primary-key id. */
  id: string;
  /** The task's name. */
  name: string;
  /** The RRULE string, or `null` when the task has no repetition rule. */
  ruleString: string | null;
  /** The repetition method, or `null` when the task has no repetition rule. */
  method: OmniRepeatMethod | null;
  /** Due date as an ISO 8601 string, or `null`. */
  dueDate: string | null;
  /** Defer date as an ISO 8601 string, or `null`. */
  deferDate: string | null;
  /** Completion date as an ISO 8601 string, or `null`. */
  completionDate: string | null;
}

/**
 * Build the OmniJS body that reads one task's rule + anchors.
 *
 * Locates the task via `Task.byIdentifier` (mirroring the SDK's `complete`/
 * `update` commands). Returns `JSON.stringify(null)` when the task is not
 * found so the caller can distinguish "not found" from an error.
 *
 * Exported for testing.
 *
 * @param taskId - The task's primary-key id.
 * @returns An OmniJS script body suitable for {@link runOmniJSWrapped}.
 *
 * @public
 */
export function buildTaskRuleScript(taskId: string): string {
  const id = escapeJSString(taskId);
  return `
var task = Task.byIdentifier("${id}");
if (!task) {
  return JSON.stringify(null);
}
var ruleString = null;
var method = null;
if (task.repetitionRule) {
  ruleString = task.repetitionRule.ruleString;
  if (task.repetitionRule.method === Task.RepetitionMethod.DueDate) {
    method = "DueDate";
  } else if (task.repetitionRule.method === Task.RepetitionMethod.Start) {
    method = "Start";
  } else if (task.repetitionRule.method === Task.RepetitionMethod.Fixed) {
    method = "Fixed";
  }
}
return JSON.stringify({
  id: task.id.primaryKey,
  name: task.name,
  ruleString: ruleString,
  method: method,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  deferDate: task.deferDate ? task.deferDate.toISOString() : null,
  completionDate: task.completionDate ? task.completionDate.toISOString() : null
});`;
}

/** Whether a value is a plain string-keyed record (not null, array, etc.). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a `string | null` field, returning `null` for any non-string value. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Narrow a raw method value to an {@link OmniRepeatMethod}, else `null`. */
function toMethod(value: unknown): OmniRepeatMethod | null {
  return value === "DueDate" || value === "Start" || value === "Fixed"
    ? value
    : null;
}

/**
 * Parse the raw OmniJS result object into a {@link TaskRule}.
 *
 * Returns `null` when the raw value is `null` (task not found) or is not a
 * usable record. Non-repeating tasks normalize to `ruleString: null` and
 * `method: null`. Exported for testing.
 *
 * @param raw - The parsed JSON result produced by {@link buildTaskRuleScript}.
 * @returns A normalized {@link TaskRule}, or `null`.
 *
 * @public
 */
export function parseTaskRuleResult(raw: unknown): TaskRule | null {
  if (!isRecord(raw)) return null;

  const id = stringOrNull(raw["id"]);
  const name = stringOrNull(raw["name"]);
  if (id === null || name === null) return null;

  return {
    id,
    name,
    ruleString: stringOrNull(raw["ruleString"]),
    method: toMethod(raw["method"]),
    dueDate: stringOrNull(raw["dueDate"]),
    deferDate: stringOrNull(raw["deferDate"]),
    completionDate: stringOrNull(raw["completionDate"]),
  };
}

/**
 * Live read of one task's repetition rule via {@link runOmniJSWrapped}.
 *
 * @param taskId - The task's primary-key id.
 * @returns The parsed {@link TaskRule}, or `null` if the task was not found.
 * @throws If the OmniJS script fails to execute.
 *
 * @public
 */
export async function readTaskRule(taskId: string): Promise<TaskRule | null> {
  const body = buildTaskRuleScript(taskId);
  const result = await runOmniJSWrapped<unknown>(body);
  if (!result.success) {
    throw new Error(result.error?.message ?? "Failed to read task rule");
  }
  return parseTaskRuleResult(result.data ?? null);
}
