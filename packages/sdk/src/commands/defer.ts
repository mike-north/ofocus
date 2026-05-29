import { z } from "zod";
import type { CliOutput, BatchResult } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateDateString } from "../validation.js";
import { escapeJSString, toOmniJSDate, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Options for deferring a task.
 */
export interface DeferOptions {
  /** Defer for a number of days from today */
  days?: number | undefined;
  /** Defer to a specific date */
  to?: string | undefined;
}

/**
 * Result from deferring a task.
 */
export interface DeferResult {
  taskId: string;
  taskName: string;
  previousDeferDate: string | null;
  newDeferDate: string;
}

/**
 * Item in batch defer result.
 */
export interface BatchDeferItem {
  taskId: string;
  taskName: string;
  previousDeferDate: string | null;
  newDeferDate: string;
}

const MAX_BATCH_SIZE = 50;

/**
 * Defer a task by a number of days or to a specific date.
 */
export async function deferTask(
  taskId: string,
  options: DeferOptions = {}
): Promise<CliOutput<DeferResult>> {
  // Validate task ID
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  // Validate that at least one option is provided
  if (options.days === undefined && options.to === undefined) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Must specify either --days or --to"
      )
    );
  }

  // Validate days
  if (
    options.days !== undefined &&
    (options.days < 1 || !Number.isInteger(options.days))
  ) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Days must be a positive integer")
    );
  }

  // Validate date string if provided
  if (options.to !== undefined) {
    const dateError = validateDateString(options.to);
    if (dateError) return failure(dateError);
  }

  // Build the defer date expression for OmniJS
  let deferDateExpr: string;
  if (options.days !== undefined) {
    const msPerDay = 86400000;
    deferDateExpr = `new Date(Date.now() + ${String(options.days)} * ${String(msPerDay)})`;
  } else {
    deferDateExpr = toOmniJSDate(options.to ?? "");
  }

  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
var previousDeferDate = task.deferDate ? task.deferDate.toISOString() : null;
task.deferDate = ${deferDateExpr};
var newDeferDate = task.deferDate ? task.deferDate.toISOString() : null;
return JSON.stringify({
  taskId: "${escapeJSString(taskId)}",
  taskName: task.name,
  previousDeferDate: previousDeferDate,
  newDeferDate: newDeferDate
});`;

  const result = await runOmniJSWrapped<DeferResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to defer task")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Defer multiple tasks by a number of days or to a specific date.
 */
export async function deferTasks(
  taskIds: string[],
  options: DeferOptions = {}
): Promise<CliOutput<BatchResult<BatchDeferItem>>> {
  // Validate all task IDs first
  for (const id of taskIds) {
    const idError = validateId(id, "task");
    if (idError) return failure(idError);
  }

  // Validate that at least one option is provided
  if (options.days === undefined && options.to === undefined) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Must specify either --days or --to"
      )
    );
  }

  // Validate days
  if (
    options.days !== undefined &&
    (options.days < 1 || !Number.isInteger(options.days))
  ) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Days must be a positive integer")
    );
  }

  // Validate date string if provided
  if (options.to !== undefined) {
    const dateError = validateDateString(options.to);
    if (dateError) return failure(dateError);
  }

  // Build the defer date expression for OmniJS
  let deferDateExpr: string;
  if (options.days !== undefined) {
    const msPerDay = 86400000;
    deferDateExpr = `new Date(Date.now() + ${String(options.days)} * ${String(msPerDay)})`;
  } else {
    deferDateExpr = toOmniJSDate(options.to ?? "");
  }

  // Process in chunks
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchDeferItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const body = `
var taskIds = ${idsJson};
var newDeferDate = ${deferDateExpr};
var succeeded = [];
var failed = [];
for (var i = 0; i < taskIds.length; i++) {
  var id = taskIds[i];
  try {
    var task = flattenedTasks.byId(id);
    if (!task) {
      failed.push({ id: id, error: "Task not found: " + id });
      continue;
    }
    var previousDeferDate = task.deferDate ? task.deferDate.toISOString() : null;
    task.deferDate = newDeferDate;
    var actualNewDeferDate = task.deferDate ? task.deferDate.toISOString() : null;
    succeeded.push({
      taskId: id,
      taskName: task.name,
      previousDeferDate: previousDeferDate,
      newDeferDate: actualNewDeferDate
    });
  } catch (err) {
    failed.push({ id: id, error: String(err) });
  }
}
return JSON.stringify({ succeeded: succeeded, failed: failed });`;

    const result = await runOmniJSWrapped<{
      succeeded: BatchDeferItem[];
      failed: { id: string; error: string }[];
    }>(body);

    if (result.success && result.data) {
      allSucceeded.push(...result.data.succeeded);
      allFailed.push(...result.data.failed);
    } else {
      // If the entire chunk failed, mark all as failed
      for (const id of chunk) {
        allFailed.push({
          id,
          error: result.error?.message ?? "Unknown error",
        });
      }
    }
  }

  return success({
    succeeded: allSucceeded,
    failed: allFailed,
    totalSucceeded: allSucceeded.length,
    totalFailed: allFailed.length,
  });
}

const deferDaysSchema = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("Defer by this many days from today");
const deferToSchema = z
  .string()
  .optional()
  .describe("Defer to a specific date (ISO 8601)");

/**
 * Centralized descriptor for the `defer` command.
 *
 * Drives the CLI subcommand `defer` and the MCP tool `task_defer`.
 *
 * @public
 */
export const deferTaskDescriptor = defineCommand({
  name: "deferTask",
  cliName: "defer",
  mcpName: "task_defer",
  description: "Defer a task by a number of days or to a specific date.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("ID of the task to defer"),
    days: deferDaysSchema,
    to: deferToSchema,
  }),
  handler: async (input) =>
    deferTask(input.taskId, { days: input.days, to: input.to }),
});

/**
 * Centralized descriptor for the `defer-batch` command.
 *
 * Drives the CLI subcommand `defer-batch` and the MCP tool
 * `tasks_defer_batch`.
 *
 * @public
 */
export const deferTasksDescriptor = defineCommand({
  name: "deferTasks",
  cliName: "defer-batch",
  mcpName: "tasks_defer_batch",
  description:
    "Defer multiple tasks by a number of days or to a specific date.",
  cliPositional: ["taskIds"],
  inputSchema: z.object({
    taskIds: z.array(z.string()).min(1).describe("Task IDs to defer"),
    days: deferDaysSchema,
    to: deferToSchema,
  }),
  handler: async (input) =>
    deferTasks(input.taskIds, { days: input.days, to: input.to }),
});
