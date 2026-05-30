import { z } from "zod";
import type { CliOutput, TaskUpdateOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateId,
  validateDateString,
  validateTags,
  validateProjectName,
  validateEstimatedMinutes,
  validateRepetitionRule,
} from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { buildRRule, repeatMethodToOmniJS } from "./repetition.js";
import { sanitizeVarName } from "../utils/sanitize.js";
import { defineCommand } from "../registry/define.js";

/**
 * Update properties of an existing task in OmniFocus.
 */
export async function updateTask(
  taskId: string,
  options: TaskUpdateOptions
): Promise<CliOutput<OFTask>> {
  // Validate inputs
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  if (options.due !== undefined && options.due !== "") {
    const dueError = validateDateString(options.due);
    if (dueError) return failure(dueError);
  }

  if (options.defer !== undefined && options.defer !== "") {
    const deferError = validateDateString(options.defer);
    if (deferError) return failure(deferError);
  }

  const tagsError = validateTags(options.tags);
  if (tagsError) return failure(tagsError);

  const projectError = validateProjectName(options.project);
  if (projectError) return failure(projectError);

  const estimateError = validateEstimatedMinutes(options.estimatedMinutes);
  if (estimateError) return failure(estimateError);

  const repeatError = validateRepetitionRule(options.repeat);
  if (repeatError) return failure(repeatError);

  // Build the OmniJS script
  const scriptParts: string[] = [];

  scriptParts.push(`
var task = Task.byIdentifier("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}`);

  if (options.title !== undefined) {
    scriptParts.push(`task.name = "${escapeJSString(options.title)}";`);
  }

  if (options.note !== undefined) {
    scriptParts.push(`task.note = "${escapeJSString(options.note)}";`);
  }

  if (options.flag !== undefined) {
    scriptParts.push(`task.flagged = ${String(options.flag)};`);
  }

  if (options.due !== undefined) {
    if (options.due === "") {
      scriptParts.push(`task.dueDate = null;`);
    } else {
      scriptParts.push(`task.dueDate = ${toOmniJSDate(options.due)};`);
    }
  }

  if (options.defer !== undefined) {
    if (options.defer === "") {
      scriptParts.push(`task.deferDate = null;`);
    } else {
      scriptParts.push(`task.deferDate = ${toOmniJSDate(options.defer)};`);
    }
  }

  if (options.project !== undefined) {
    if (options.project === "") {
      scriptParts.push(`moveTasks([task], inbox.beginning);`);
    } else {
      scriptParts.push(`
var proj = flattenedProjects.byName("${escapeJSString(options.project)}");
if (!proj) {
  throw new Error("Project not found: ${escapeJSString(options.project)}");
}
moveTasks([task], proj.ending);`);
    }
  }

  if (options.estimatedMinutes !== undefined) {
    scriptParts.push(
      `task.estimatedMinutes = ${String(options.estimatedMinutes)};`
    );
  }

  if (options.clearEstimate === true) {
    scriptParts.push(`task.estimatedMinutes = null;`);
  }

  // Handle repetition rule
  if (options.clearRepeat === true) {
    scriptParts.push(`task.repetitionRule = null;`);
  } else if (options.repeat !== undefined) {
    const rrule = buildRRule(options.repeat);
    const method = repeatMethodToOmniJS(options.repeat.repeatMethod);
    scriptParts.push(
      `task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});`
    );
  }

  // Handle tags - clear and re-add
  if (options.tags !== undefined) {
    scriptParts.push(`
task.clearTags();`);
    for (const [i, tagName] of options.tags.entries()) {
      const varName = sanitizeVarName(tagName, i);
      scriptParts.push(`
var ${varName} = flattenedTags.byName("${escapeJSString(tagName)}");
if (${varName}) { task.addTag(${varName}); }`);
    }
  }

  // Serialize and return
  scriptParts.push(`
var projId = null;
var projName = null;
if (task.containingProject) {
  projId = task.containingProject.id.primaryKey;
  projName = task.containingProject.name;
}
var tagNames = task.tags.map(function(t) { return t.name; });

return JSON.stringify({
  id: task.id.primaryKey,
  name: task.name,
  note: task.note || null,
  flagged: task.flagged,
  completed: task.completed,
  dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  deferDate: task.deferDate ? task.deferDate.toISOString() : null,
  completionDate: task.completionDate ? task.completionDate.toISOString() : null,
  projectId: projId,
  projectName: projName,
  tags: tagNames,
  estimatedMinutes: task.estimatedMinutes != null ? task.estimatedMinutes : null
});`);

  const body = scriptParts.join("\n");
  const result = await runOmniJSWrapped<OFTask>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to update task")
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
 * Shared Zod schema for a repetition rule — used in the `updateTaskDescriptor`
 * for both the MCP tool (object supplied directly) and the CLI adapter (JSON
 * string via `--repeat '<json>'` which is preprocessed into an object).
 * Defined inline to keep it co-located with the descriptor.
 */
const RepetitionRuleSchema = z.object({
  frequency: z
    .enum(["daily", "weekly", "monthly", "yearly"])
    .describe("Recurrence frequency"),
  interval: z.number().int().min(1).describe("Repeat every N periods"),
  repeatMethod: z
    .enum(["due-again", "defer-another", "scheduled"])
    .describe("How OmniFocus reschedules the task after completion"),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .optional()
    .describe("Days of the week to repeat on (0=Sunday … 6=Saturday)"),
  dayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Day of month for monthly repetitions"),
  daysOfWeekPositions: z
    .array(z.number().int())
    .optional()
    .describe(
      "Positional prefix for BYDAY in monthly repetitions (e.g. 1 = first, -1 = last)"
    ),
  monthsOfYear: z
    .array(z.number().int().min(1).max(12))
    .optional()
    .describe("Months of the year for yearly repetitions (1=Jan … 12=Dec)"),
});

/**
 * Centralized descriptor for the `update` command.
 *
 * Drives the CLI subcommand `update` and the MCP tool `task_update`.
 *
 * The MCP tool supplies the `repeat` field as a JSON object directly.
 * The CLI adapter receives every option as a string; `--repeat` must be
 * passed as a JSON string. A `z.preprocess` wrapper on the `repeat` field
 * transparently parses that JSON string into an object before Zod validates
 * the shape, so the handler always receives a fully-typed object regardless
 * of which transport was used. See the `repeat` field description for the
 * expected JSON shape.
 *
 * @public
 */
export const updateTaskDescriptor = defineCommand({
  name: "updateTask",
  cliName: "update",
  mcpName: "task_update",
  description: "Update properties of an existing task.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to update"),
    title: z.string().optional().describe("New task title"),
    note: z.string().optional().describe("New task note"),
    due: z
      .string()
      .optional()
      .describe("New due date (ISO 8601 or relative; empty string to clear)"),
    defer: z
      .string()
      .optional()
      .describe("New defer date (ISO 8601 or relative; empty string to clear)"),
    flag: z
      .boolean()
      .optional()
      .describe("Flag (true) or unflag (false) the task"),
    project: z
      .string()
      .optional()
      .describe("Move to project by name (empty string to move to inbox)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Replace all tags with this list"),
    estimatedMinutes: z
      .number()
      .optional()
      .describe("Estimated duration in minutes"),
    clearEstimate: z
      .boolean()
      .optional()
      .describe("Clear the estimated duration when true"),
    repeat: z
      .preprocess(
        // CLI supplies --repeat as a JSON string; MCP supplies an object.
        // If the value is a string, attempt JSON.parse — on failure return
        // the raw string so Zod reports a clean VALIDATION_ERROR rather than
        // throwing a SyntaxError.
        (v) => {
          if (typeof v !== "string") return v;
          try {
            return JSON.parse(v) as unknown;
          } catch {
            return v;
          }
        },
        RepetitionRuleSchema
      )
      .optional()
      .describe(
        "Set a repetition rule on the task. " +
          "MCP: pass as an object. " +
          'CLI: pass as a JSON string, e.g. --repeat \'{"frequency":"weekly","interval":1,"repeatMethod":"due-again","daysOfWeek":[1,3,5]}\''
      ),
    clearRepeat: z
      .boolean()
      .optional()
      .describe("Clear the repetition rule when true"),
  }),
  handler: async (input) =>
    updateTask(input.taskId, {
      title: input.title,
      note: input.note,
      due: input.due,
      defer: input.defer,
      flag: input.flag,
      project: input.project,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
      clearEstimate: input.clearEstimate,
      repeat: input.repeat,
      clearRepeat: input.clearRepeat,
    }),
});
