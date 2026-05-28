import { z } from "zod";
import type { CliOutput, InboxOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateDateString,
  validateTags,
  validateEstimatedMinutes,
  validateRepetitionRule,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule } from "./repetition.js";
import { sanitizeVarName } from "../utils/sanitize.js";
import { defineCommand } from "../registry/define.js";

/**
 * Add a task to the OmniFocus inbox.
 */
export async function addToInbox(
  title: string,
  options: InboxOptions = {}
): Promise<CliOutput<OFTask>> {
  // Validate inputs
  if (options.due !== undefined) {
    const dueError = validateDateString(options.due);
    if (dueError) return failure(dueError);
  }

  if (options.defer !== undefined) {
    const deferError = validateDateString(options.defer);
    if (deferError) return failure(deferError);
  }

  const tagsError = validateTags(options.tags);
  if (tagsError) return failure(tagsError);

  const estimateError = validateEstimatedMinutes(options.estimatedMinutes);
  if (estimateError) return failure(estimateError);

  const repeatError = validateRepetitionRule(options.repeat);
  if (repeatError) return failure(repeatError);

  // Build the OmniJS script
  const scriptParts: string[] = [];

  scriptParts.push(
    `var task = new Task("${escapeJSString(title)}", inbox.beginning);`
  );

  if (options.note !== undefined) {
    scriptParts.push(`task.note = "${escapeJSString(options.note)}";`);
  }

  if (options.flag === true) {
    scriptParts.push(`task.flagged = true;`);
  }

  if (options.due !== undefined) {
    scriptParts.push(`task.dueDate = ${toOmniJSDate(options.due)};`);
  }

  if (options.defer !== undefined) {
    scriptParts.push(`task.deferDate = ${toOmniJSDate(options.defer)};`);
  }

  if (options.estimatedMinutes !== undefined) {
    scriptParts.push(
      `task.estimatedMinutes = ${String(options.estimatedMinutes)};`
    );
  }

  // Handle tags
  if (options.tags && options.tags.length > 0) {
    for (const [i, tagName] of options.tags.entries()) {
      const varName = sanitizeVarName(tagName, i);
      scriptParts.push(
        `var ${varName} = flattenedTags.byName("${escapeJSString(tagName)}");`
      );
      scriptParts.push(`if (${varName}) { task.addTag(${varName}); }`);
    }
  }

  // Handle repetition rule
  if (options.repeat) {
    const rrule = buildRRule(options.repeat);
    const method =
      options.repeat.repeatMethod === "due-again"
        ? "Task.RepetitionMethod.DueDate"
        : "Task.RepetitionMethod.DeferDate";
    scriptParts.push(
      `task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});`
    );
  }

  // Serialize and return
  scriptParts.push(`
var tagNames = task.tags.map(function(t) { return t.name; });
return JSON.stringify({
  id: task.id.primaryKey,
  name: task.name,
  note: task.note || null,
  flagged: task.flagged,
  completed: task.completed,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  deferDate: task.deferDate ? task.deferDate.toISOString() : null,
  completionDate: null,
  projectId: null,
  projectName: null,
  tags: tagNames,
  estimatedMinutes: task.estimatedMinutes != null ? task.estimatedMinutes : null
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTask>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to add task to inbox")
    );
  }

  if (result.data === undefined) {
    return failure(
      createError(ErrorCode.UNKNOWN_ERROR, "No task data returned")
    );
  }

  return success(result.data);
}

/**
 * Centralized descriptor for the inbox-add command.
 *
 * Drives the CLI subcommand `inbox` (kebab-case override of the canonical
 * `addToInbox`) and the MCP tool `inbox_add` (snake_case override). The Zod
 * schema is intentionally flat — agents and CLI users get one knob per
 * concept rather than a nested `repeat` object that's awkward to fill in.
 * The handler reassembles the repetition fields into the SDK function's
 * nested `RepetitionRule`.
 *
 * @public
 */
export const addToInboxDescriptor = defineCommand({
  name: "addToInbox",
  cliName: "inbox",
  mcpName: "inbox_add",
  description: "Add a new task to the OmniFocus inbox.",
  inputSchema: z.object({
    title: z.string().describe("Task title"),
    note: z.string().optional().describe("Task note / description"),
    due: z
      .string()
      .optional()
      .describe("Due date (ISO 8601 or natural language like 'tomorrow')"),
    defer: z
      .string()
      .optional()
      .describe("Defer date (ISO 8601 or natural language)"),
    flag: z.boolean().optional().describe("Mark the task as flagged"),
    tags: z.array(z.string()).optional().describe("Tag names to apply"),
    estimatedMinutes: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Estimated duration in minutes"),
    repeatFrequency: z
      .enum(["daily", "weekly", "monthly", "yearly"])
      .optional()
      .describe("Repetition frequency"),
    repeatInterval: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Repeat every N periods (default: 1)"),
    repeatMethod: z
      .enum(["due-again", "defer-another"])
      .optional()
      .describe("Anchor for the next occurrence (default: due-again)"),
    repeatDaysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe("Days of week for weekly repeats (0=Sunday … 6=Saturday)"),
    repeatDayOfMonth: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe("Day of month for monthly repeats"),
  }),
  handler: async (input) => {
    const repeat: InboxOptions["repeat"] =
      input.repeatFrequency !== undefined
        ? {
            frequency: input.repeatFrequency,
            interval: input.repeatInterval ?? 1,
            repeatMethod: input.repeatMethod ?? "due-again",
            daysOfWeek: input.repeatDaysOfWeek,
            dayOfMonth: input.repeatDayOfMonth,
          }
        : undefined;
    return addToInbox(input.title, {
      note: input.note,
      due: input.due,
      defer: input.defer,
      flag: input.flag,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
      repeat,
    });
  },
});
