import { z } from "zod";
import type { CliOutput, DuplicateTaskOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from duplicating a task.
 */
export interface DuplicateTaskResult {
  originalTaskId: string;
  newTaskId: string;
  newTaskName: string;
}

/**
 * Duplicate a task in OmniFocus.
 * Creates a copy of the task with all its properties.
 */
export async function duplicateTask(
  taskId: string,
  options: DuplicateTaskOptions = {}
): Promise<CliOutput<DuplicateTaskResult>> {
  // Validate task ID
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  // Default to including subtasks
  const includeSubtasks = options.includeSubtasks !== false;

  // Build the post-duplicate subtask removal snippet (only when not including subtasks)
  const removeSubtasksSnippet = includeSubtasks
    ? ""
    : `
  // Remove subtasks from the duplicate
  var children = newTask.children.slice();
  for (var c = 0; c < children.length; c++) {
    deleteObject(children[c]);
  }`;

  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}

// Determine the location: place the duplicate after the original in its container
var location = task.containingProject ? task.containingProject.ending : inbox.ending;
var parent = task.parent;
if (parent && parent instanceof Task) {
  location = parent.ending;
}

var newTasks = duplicateTasks([task], location);
var newTask = newTasks[0];
${removeSubtasksSnippet}
return JSON.stringify({
  originalTaskId: "${escapeJSString(taskId)}",
  newTaskId: newTask.id.primaryKey,
  newTaskName: newTask.name
});`;

  const result = await runOmniJSWrapped<DuplicateTaskResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to duplicate task")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}


/**
 * Centralized descriptor for the `duplicate` command.
 *
 * Drives the CLI subcommand `duplicate` and the MCP tool `task_duplicate`.
 *
 * @public
 */
export const duplicateTaskDescriptor = defineCommand({
  name: "duplicateTask",
  cliName: "duplicate",
  mcpName: "task_duplicate",
  description:
    "Duplicate an existing task, optionally including its subtasks.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to duplicate"),
    includeSubtasks: z
      .boolean()
      .optional()
      .describe("Include subtasks in the duplicate (default: true)"),
  }),
  handler: async (input) => {
    const options: DuplicateTaskOptions = {};
    if (input.includeSubtasks !== undefined) {
      options.includeSubtasks = input.includeSubtasks;
    }
    return duplicateTask(input.taskId, options);
  },
});
