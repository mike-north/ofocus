import type { CliOutput, DuplicateTaskOptions } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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

  // AppleScript's duplicate command includes subtasks by default
  // We need to handle the case where we don't want subtasks
  const duplicateScript = includeSubtasks
    ? `set newTask to duplicate theTask`
    : `set newTask to duplicate theTask
       -- Remove subtasks if not including them (iterate in reverse to avoid skipping)
       repeat with i from (count of tasks of newTask) to 1 by -1
         delete task i of newTask
       end repeat`;

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    ${duplicateScript}

    set newId to id of newTask
    set newName to name of newTask

    return "{" & ¬
      "\\"originalTaskId\\": \\"${escapeAppleScript(taskId)}\\"," & ¬
      "\\"newTaskId\\": \\"" & newId & "\\"," & ¬
      "\\"newTaskName\\": \\"" & (my escapeJson(newName)) & "\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<DuplicateTaskResult>(
    omniFocusScriptWithHelpers(script)
  );

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
