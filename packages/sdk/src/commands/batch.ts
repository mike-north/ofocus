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
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";
import {
  buildRepetitionRuleScript,
  buildClearRepetitionScript,
} from "./repetition.js";

/** Batch complete result item */
export interface BatchCompleteItem {
  taskId: string;
  taskName: string;
}

/** Batch delete result item */
export interface BatchDeleteItem {
  taskId: string;
}

// Maximum tasks per batch to avoid AppleScript timeouts
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

    const script = `
      set taskIdList to ${idsJson}
      set succeededList to {}
      set failedList to {}

      repeat with taskIdStr in taskIdList
        try
          set theTask to first flattened task whose id is taskIdStr
          set completed of theTask to true
          set taskName to name of theTask
          set end of succeededList to {taskIdStr, taskName}
        on error errMsg
          set end of failedList to {taskIdStr, errMsg}
        end try
      end repeat

      set output to "{\\"succeeded\\": ["
      set isFirst to true
      repeat with item in succeededList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"taskId\\": \\"" & (item 1) & "\\", \\"taskName\\": \\"" & (my escapeJson(item 2 as string)) & "\\"}"
      end repeat
      set output to output & "], \\"failed\\": ["
      set isFirst to true
      repeat with item in failedList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"id\\": \\"" & (item 1) & "\\", \\"error\\": \\"" & (my escapeJson(item 2 as string)) & "\\"}"
      end repeat
      set output to output & "]}"

      return output
    `;

    const result = await runAppleScript<{
      succeeded: BatchCompleteItem[];
      failed: { id: string; error: string }[];
    }>(omniFocusScriptWithHelpers(script));

    if (!result.success) {
      return failure(
        result.error ??
          createError(ErrorCode.UNKNOWN_ERROR, "Failed to complete tasks")
      );
    }

    if (result.data) {
      allSucceeded.push(...result.data.succeeded);
      allFailed.push(...result.data.failed);
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

  // Build the update statements
  const updates: string[] = [];

  if (options.title !== undefined) {
    updates.push(
      `set name of theTask to "${escapeAppleScript(options.title)}"`
    );
  }

  if (options.note !== undefined) {
    updates.push(
      `set note of theTask to "${escapeAppleScript(options.note)}"`
    );
  }

  if (options.flag !== undefined) {
    updates.push("set flagged of theTask to " + String(options.flag));
  }

  if (options.due !== undefined) {
    if (options.due === "") {
      updates.push(`set due date of theTask to missing value`);
    } else {
      updates.push(`set due date of theTask to date "${options.due}"`);
    }
  }

  if (options.defer !== undefined) {
    if (options.defer === "") {
      updates.push(`set defer date of theTask to missing value`);
    } else {
      updates.push(`set defer date of theTask to date "${options.defer}"`);
    }
  }

  if (options.estimatedMinutes !== undefined) {
    updates.push(
      `set estimated minutes of theTask to ${String(options.estimatedMinutes)}`
    );
  }

  if (options.clearEstimate === true) {
    updates.push(`set estimated minutes of theTask to missing value`);
  }

  // Handle repetition
  let repetitionScript = "";
  if (options.clearRepeat === true) {
    repetitionScript = buildClearRepetitionScript("theTask");
  } else if (options.repeat !== undefined) {
    repetitionScript = buildRepetitionRuleScript("theTask", options.repeat);
  }

  // Handle project assignment
  let projectScript = "";
  if (options.project !== undefined) {
    if (options.project === "") {
      projectScript = `set containing project of theTask to missing value`;
    } else {
      projectScript = `
        set theProject to first flattened project whose name is "${escapeAppleScript(options.project)}"
        move theTask to end of tasks of theProject
      `;
    }
  }

  // Handle tags - clear and re-add
  let tagScript = "";
  if (options.tags !== undefined) {
    tagScript = `
      repeat with existingTag in (tags of theTask)
        remove existingTag from tags of theTask
      end repeat
    `;

    for (const tagName of options.tags) {
      tagScript += `
      try
        set theTag to first flattened tag whose name is "${escapeAppleScript(tagName)}"
        add theTag to tags of theTask
      end try
      `;
    }
  }

  const updateScript = updates.join("\n          ");

  // Process in chunks if needed
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchCompleteItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const script = `
      set taskIdList to ${idsJson}
      set succeededList to {}
      set failedList to {}

      repeat with taskIdStr in taskIdList
        try
          set theTask to first flattened task whose id is taskIdStr
          ${updateScript}
          ${projectScript}
          ${tagScript}
          ${repetitionScript}
          set taskName to name of theTask
          set end of succeededList to {taskIdStr, taskName}
        on error errMsg
          set end of failedList to {taskIdStr, errMsg}
        end try
      end repeat

      set output to "{\\"succeeded\\": ["
      set isFirst to true
      repeat with item in succeededList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"taskId\\": \\"" & (item 1) & "\\", \\"taskName\\": \\"" & (my escapeJson(item 2 as string)) & "\\"}"
      end repeat
      set output to output & "], \\"failed\\": ["
      set isFirst to true
      repeat with item in failedList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"id\\": \\"" & (item 1) & "\\", \\"error\\": \\"" & (my escapeJson(item 2 as string)) & "\\"}"
      end repeat
      set output to output & "]}"

      return output
    `;

    const result = await runAppleScript<{
      succeeded: BatchCompleteItem[];
      failed: { id: string; error: string }[];
    }>(omniFocusScriptWithHelpers(script));

    if (!result.success) {
      return failure(
        result.error ??
          createError(ErrorCode.UNKNOWN_ERROR, "Failed to update tasks")
      );
    }

    if (result.data) {
      allSucceeded.push(...result.data.succeeded);
      allFailed.push(...result.data.failed);
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

    const script = `
      set taskIdList to ${idsJson}
      set succeededList to {}
      set failedList to {}

      repeat with taskIdStr in taskIdList
        try
          set theTask to first flattened task whose id is taskIdStr
          delete theTask
          set end of succeededList to taskIdStr
        on error errMsg
          set end of failedList to {taskIdStr, errMsg}
        end try
      end repeat

      set output to "{\\"succeeded\\": ["
      set isFirst to true
      repeat with item in succeededList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"taskId\\": \\"" & item & "\\"}"
      end repeat
      set output to output & "], \\"failed\\": ["
      set isFirst to true
      repeat with item in failedList
        if not isFirst then set output to output & ","
        set isFirst to false
        set output to output & "{\\"id\\": \\"" & (item 1) & "\\", \\"error\\": \\"" & (my escapeJson(item 2 as string)) & "\\"}"
      end repeat
      set output to output & "]}"

      return output
    `;

    const result = await runAppleScript<{
      succeeded: BatchDeleteItem[];
      failed: { id: string; error: string }[];
    }>(omniFocusScriptWithHelpers(script));

    if (!result.success) {
      return failure(
        result.error ??
          createError(ErrorCode.UNKNOWN_ERROR, "Failed to delete tasks")
      );
    }

    if (result.data) {
      allSucceeded.push(...result.data.succeeded);
      allFailed.push(...result.data.failed);
    }
  }

  return success({
    succeeded: allSucceeded,
    failed: allFailed,
    totalSucceeded: allSucceeded.length,
    totalFailed: allFailed.length,
  });
}
