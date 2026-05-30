import { z } from "zod";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeJSString, runOmniJSWrapped } from "../omnijs.js";
import { defineCommand } from "../registry/define.js";

/**
 * Result from dropping a task.
 */
export interface DropResult {
  taskId: string;
  taskName: string;
  dropped: boolean;
}

/**
 * Result from deleting a task.
 */
export interface DeleteResult {
  taskId: string;
  deleted: true;
}

/**
 * Drop a task in OmniFocus (marks as dropped but keeps history).
 */
export async function dropTask(taskId: string): Promise<CliOutput<DropResult>> {
  // Validate task ID
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const body = `
var task = Task.byIdentifier("${escapeJSString(taskId)}");
if (!task) {
  throw new Error("Task not found: ${escapeJSString(taskId)}");
}
task.drop(true);

return JSON.stringify({
  taskId: task.id.primaryKey,
  taskName: task.name,
  dropped: task.taskStatus === Task.Status.Dropped
});`;

  const result = await runOmniJSWrapped<DropResult>(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to drop task")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Delete a task permanently from OmniFocus.
 * Note: This cannot be undone.
 */
export async function deleteTask(
  taskId: string
): Promise<CliOutput<DeleteResult>> {
  // Validate task ID
  const idError = validateId(taskId, "task");
  if (idError) return failure(idError);

  const body = `
var task = Task.byIdentifier("${escapeJSString(taskId)}");
if (!task) {
  return JSON.stringify({ error: "not found", taskId: "${escapeJSString(taskId)}" });
}
deleteObject(task);
return JSON.stringify({ taskId: "${escapeJSString(taskId)}", deleted: true });`;

  const result = await runOmniJSWrapped<
    DeleteResult | { error: string; taskId: string }
  >(body);

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete task")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  // Check if we got a "not found" response
  if ("error" in result.data && result.data.error === "not found") {
    return failure(
      createError(ErrorCode.TASK_NOT_FOUND, `Task not found: ${taskId}`)
    );
  }

  return success(result.data as DeleteResult);
}

/**
 * Centralized descriptor for the `drop` command.
 *
 * Drives the CLI subcommand `drop` and the MCP tool `task_drop`.
 *
 * @public
 */
export const dropTaskDescriptor = defineCommand({
  name: "dropTask",
  cliName: "drop",
  mcpName: "task_drop",
  description: "Drop a task (marks it as dropped but preserves history).",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to drop"),
  }),
  handler: async (input) => dropTask(input.taskId),
});

/**
 * Centralized descriptor for the `delete` command.
 *
 * Drives the CLI subcommand `delete` and the MCP tool `task_delete`.
 *
 * @public
 */
export const deleteTaskDescriptor = defineCommand({
  name: "deleteTask",
  cliName: "delete",
  mcpName: "task_delete",
  description: "Permanently delete a task from OmniFocus. Cannot be undone.",
  cliPositional: ["taskId"],
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to delete"),
  }),
  handler: async (input) => deleteTask(input.taskId),
});
