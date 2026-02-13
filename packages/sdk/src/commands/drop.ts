import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    mark dropped theTask

    set taskName to name of theTask
    set taskDropped to dropped of theTask

    return "{" & ¬
      "\\"taskId\\": \\"${escapeAppleScript(taskId)}\\"," & ¬
      "\\"taskName\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
      "\\"dropped\\": " & taskDropped & ¬
      "}"
  `;

  const result = await runAppleScript<DropResult>(
    omniFocusScriptWithHelpers(script)
  );

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

  const script = `
    try
      set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
      delete theTask
      return "{\\"taskId\\": \\"${escapeAppleScript(taskId)}\\", \\"deleted\\": true}"
    on error errMsg
      if errMsg contains "Can't get" or errMsg contains "not found" then
        return "{\\"error\\": \\"not found\\", \\"taskId\\": \\"${escapeAppleScript(taskId)}\\"}"
      else
        error errMsg
      end if
    end try
  `;

  const result = await runAppleScript<
    DeleteResult | { error: string; taskId: string }
  >(omniFocusScriptWithHelpers(script));

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
