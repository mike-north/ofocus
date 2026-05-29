import { z } from "zod";
import type { CliOutput, TaskUpdateOptions, BatchResult } from "../types.js";
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
import { buildRRule } from "./repetition.js";
import { sanitizeVarName } from "../utils/sanitize.js";
import { defineCommand } from "../registry/define.js";

/** Batch complete result item */
export interface BatchCompleteItem {
  taskId: string;
  taskName: string;
}

/** Batch delete result item */
export interface BatchDeleteItem {
  taskId: string;
}

// Maximum tasks per batch to avoid OmniJS timeouts
const MAX_BATCH_SIZE = 50;

/**
 * Complete multiple tasks in a single operation.
 */
export async function completeTasks(
  taskIds: string[]
): Promise<CliOutput<BatchResult<BatchCompleteItem>>> {
  // Validate inputs
  if (taskIds.length === 0) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "No task IDs provided")
    );
  }

  for (const id of taskIds) {
    const idError = validateId(id, "task");
    if (idError) return failure(idError);
  }

  // Process in chunks if needed
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchCompleteItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const body = `
var taskIds = ${idsJson};
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
    task.markComplete();
    succeeded.push({ taskId: id, taskName: task.name });
  } catch (err) {
    failed.push({ id: id, error: String(err) });
  }
}
return JSON.stringify({ succeeded: succeeded, failed: failed });`;

    const result = await runOmniJSWrapped<{
      succeeded: BatchCompleteItem[];
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

/**
 * Update multiple tasks with the same properties in a single operation.
 */
export async function updateTasks(
  taskIds: string[],
  options: TaskUpdateOptions
): Promise<CliOutput<BatchResult<BatchCompleteItem>>> {
  // Validate inputs
  if (taskIds.length === 0) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "No task IDs provided")
    );
  }

  for (const id of taskIds) {
    const idError = validateId(id, "task");
    if (idError) return failure(idError);
  }

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

  // Build per-task update statements (applied inside the loop body)
  const updateParts: string[] = [];

  if (options.title !== undefined) {
    updateParts.push(`task.name = "${escapeJSString(options.title)}";`);
  }

  if (options.note !== undefined) {
    updateParts.push(`task.note = "${escapeJSString(options.note)}";`);
  }

  if (options.flag !== undefined) {
    updateParts.push(`task.flagged = ${String(options.flag)};`);
  }

  if (options.due !== undefined) {
    if (options.due === "") {
      updateParts.push(`task.dueDate = null;`);
    } else {
      updateParts.push(`task.dueDate = ${toOmniJSDate(options.due)};`);
    }
  }

  if (options.defer !== undefined) {
    if (options.defer === "") {
      updateParts.push(`task.deferDate = null;`);
    } else {
      updateParts.push(`task.deferDate = ${toOmniJSDate(options.defer)};`);
    }
  }

  if (options.estimatedMinutes !== undefined) {
    updateParts.push(
      `task.estimatedMinutes = ${String(options.estimatedMinutes)};`
    );
  }

  if (options.clearEstimate === true) {
    updateParts.push(`task.estimatedMinutes = null;`);
  }

  // Handle repetition
  if (options.clearRepeat === true) {
    updateParts.push(`task.repetitionRule = null;`);
  } else if (options.repeat !== undefined) {
    const rrule = buildRRule(options.repeat);
    const method =
      options.repeat.repeatMethod === "due-again"
        ? "Task.RepetitionMethod.DueDate"
        : "Task.RepetitionMethod.DeferDate";
    updateParts.push(
      `task.repetitionRule = new Task.RepetitionRule("${escapeJSString(rrule)}", ${method});`
    );
  }

  // Handle project assignment
  if (options.project !== undefined) {
    if (options.project === "") {
      updateParts.push(`moveTasks([task], inbox.beginning);`);
    } else {
      updateParts.push(`
var proj = flattenedProjects.byName("${escapeJSString(options.project)}");
if (!proj) {
  throw new Error("Project not found: ${escapeJSString(options.project)}");
}
moveTasks([task], proj.ending);`);
    }
  }

  // Handle tags - clear and re-add
  if (options.tags !== undefined) {
    updateParts.push(`task.clearTags();`);
    for (const [i, tagName] of options.tags.entries()) {
      const varName = sanitizeVarName(tagName, i);
      updateParts.push(`
var ${varName} = flattenedTags.byName("${escapeJSString(tagName)}");
if (${varName}) { task.addTag(${varName}); }`);
    }
  }

  const perTaskScript = updateParts.join("\n    ");

  // Process in chunks if needed
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchCompleteItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const body = `
var taskIds = ${idsJson};
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
    ${perTaskScript}
    succeeded.push({ taskId: id, taskName: task.name });
  } catch (err) {
    failed.push({ id: id, error: String(err) });
  }
}
return JSON.stringify({ succeeded: succeeded, failed: failed });`;

    const result = await runOmniJSWrapped<{
      succeeded: BatchCompleteItem[];
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

/**
 * Delete multiple tasks permanently in a single operation.
 */
export async function deleteTasks(
  taskIds: string[]
): Promise<CliOutput<BatchResult<BatchDeleteItem>>> {
  // Validate inputs
  if (taskIds.length === 0) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "No task IDs provided")
    );
  }

  for (const id of taskIds) {
    const idError = validateId(id, "task");
    if (idError) return failure(idError);
  }

  // Process in chunks if needed
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchDeleteItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const body = `
var taskIds = ${idsJson};
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
    deleteObject(task);
    succeeded.push({ taskId: id });
  } catch (err) {
    failed.push({ id: id, error: String(err) });
  }
}
return JSON.stringify({ succeeded: succeeded, failed: failed });`;

    const result = await runOmniJSWrapped<{
      succeeded: BatchDeleteItem[];
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

/** Shared positional schema for the batch task-ID commands. */
const taskIdsSchema = z
  .array(z.string())
  .min(1)
  .describe("Task IDs to operate on");

/**
 * Centralized descriptor for the `complete-batch` command.
 *
 * Drives the CLI subcommand `complete-batch` and the MCP tool
 * `tasks_complete_batch`.
 *
 * @public
 */
export const completeTasksDescriptor = defineCommand({
  name: "completeTasks",
  cliName: "complete-batch",
  mcpName: "tasks_complete_batch",
  description: "Complete multiple tasks in a single operation.",
  cliPositional: ["taskIds"],
  inputSchema: z.object({
    taskIds: taskIdsSchema,
  }),
  handler: async (input) => completeTasks(input.taskIds),
});

/**
 * Centralized descriptor for the `update-batch` command.
 *
 * Drives the CLI subcommand `update-batch` and the MCP tool
 * `tasks_update_batch`.
 *
 * @public
 */
export const updateTasksDescriptor = defineCommand({
  name: "updateTasks",
  cliName: "update-batch",
  mcpName: "tasks_update_batch",
  description: "Apply the same property changes to multiple tasks at once.",
  cliPositional: ["taskIds"],
  inputSchema: z.object({
    taskIds: taskIdsSchema,
    title: z.string().optional().describe("New title for all tasks"),
    note: z.string().optional().describe("New note for all tasks"),
    due: z.string().optional().describe("New due date for all tasks"),
    defer: z.string().optional().describe("New defer date for all tasks"),
    flag: z.boolean().optional().describe("Flag or unflag all tasks"),
    project: z.string().optional().describe("Move all tasks to this project"),
    tags: z.array(z.string()).optional().describe("Replace tags on all tasks"),
    estimatedMinutes: z
      .number()
      .optional()
      .describe("Estimated duration in minutes for all tasks"),
  }),
  handler: async (input) =>
    updateTasks(input.taskIds, {
      title: input.title,
      note: input.note,
      due: input.due,
      defer: input.defer,
      flag: input.flag,
      project: input.project,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
    }),
});

/**
 * Centralized descriptor for the `delete-batch` command.
 *
 * Drives the CLI subcommand `delete-batch` and the MCP tool
 * `tasks_delete_batch`.
 *
 * @public
 */
export const deleteTasksDescriptor = defineCommand({
  name: "deleteTasks",
  cliName: "delete-batch",
  mcpName: "tasks_delete_batch",
  description: "Permanently delete multiple tasks in a single operation.",
  cliPositional: ["taskIds"],
  inputSchema: z.object({
    taskIds: taskIdsSchema,
  }),
  handler: async (input) => deleteTasks(input.taskIds),
});
