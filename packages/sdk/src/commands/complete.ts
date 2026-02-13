import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runComposedScript } from "../applescript.js";
import { loadScriptContentCached } from "../asset-loader.js";

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

  // Load external AppleScript helpers
  const jsonHelpers = await loadScriptContentCached("helpers/json.applescript");

  const body = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"
    mark complete theTask

    set taskName to name of theTask
    set taskCompleted to completed of theTask

    return "{" & ¬
      "\\"taskId\\": \\"${escapeAppleScript(taskId)}\\"," & ¬
      "\\"taskName\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
      "\\"completed\\": " & taskCompleted & ¬
      "}"
  `;

  const result = await runComposedScript<CompleteResult>([jsonHelpers], body);

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
