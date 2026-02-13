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
    ? `set newTask to duplicate theTask to theContainer`
    : `set newTask to duplicate theTask to theContainer
       -- Remove subtasks if not including them (iterate in reverse to avoid skipping)
       repeat with i from (count of tasks of newTask) to 1 by -1
         delete task i of newTask
       end repeat`;

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"

    -- Determine the container for the duplicate
    set theContainer to missing value
    try
      -- Try to get the parent task first (for subtasks)
      set parentTask to container of theTask
      if class of parentTask is task then
        set theContainer to parentTask
      end if
    end try

    if theContainer is missing value then
      try
        -- Try to get the containing project
        set theProj to containing project of theTask
        if theProj is not missing value then
          set theContainer to theProj
        end if
      end try
    end if

    if theContainer is missing value then
      -- Task is in inbox, duplicate to end of inbox tasks
      set newTask to duplicate theTask to end of inbox tasks
      set newId to id of newTask
      set newName to name of newTask
      return "{" & ¬
        "\\"originalTaskId\\": \\"${escapeAppleScript(taskId)}\\"," & ¬
        "\\"newTaskId\\": \\"" & newId & "\\"," & ¬
        "\\"newTaskName\\": \\"" & (my escapeJson(newName)) & "\\"" & ¬
        "}"
    end if

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
