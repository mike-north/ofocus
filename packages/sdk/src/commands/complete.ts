import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from completing a task.
 */
export interface CompleteResult {
  taskId: string;
  taskName: string;
  completed: boolean;
}

/**
 * Mark a task as complete in OmniFocus.
 */
export async function completeTask(
  taskId: string
): Promise<CliOutput<CompleteResult>> {
  // Validate task ID
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const body = `
var task = flattenedTasks.byId("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
task.markComplete();

return JSON.stringify({
  taskId: task.id.primaryKey,
  taskName: task.name,
  completed: task.completed
});`;

  const result = await runOmniJSWrapped<CompleteResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to complete task")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}


/**
 * Centralized descriptor for the `complete` command.
 *
 * Drives the CLI subcommand `complete` and the MCP tool `task_complete`.
 *
 * @public
 */
export const completeTaskDescriptor = defineCommand({
  name: "completeTask",
  cliName: "complete",
  mcpName: "task_complete",
  description: "Mark a task as complete in OmniFocus.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to complete"),
  }),
  handler: async (input) => completeTask(input.taskId),
});
