import type { CliOutput, BatchResult } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId, validateDateString } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

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

  // Build the defer date logic
  let deferLogic: string;
  if (options.days !== undefined) {
    deferLogic = `set newDefer to (current date) + (${String(options.days)} * days)`;
  } else {
    deferLogic = `set newDefer to date "${escapeAppleScript(options.to ?? "")}"`;
  }

  const script = `
    set theTask to first flattened task whose id is "${escapeAppleScript(taskId)}"

    -- Get previous defer date
    set prevDefer to ""
    try
      set prevDefer to (defer date of theTask) as string
    end try

    -- Calculate new defer date
    ${deferLogic}

    -- Set the defer date
    set defer date of theTask to newDefer

    -- Get the new defer date as string
    set newDeferStr to (defer date of theTask) as string

    return "{" & ¬
      "\\"taskId\\": \\"${escapeAppleScript(taskId)}\\"," & ¬
      "\\"taskName\\": \\"" & (my escapeJson(name of theTask)) & "\\"," & ¬
      "\\"previousDeferDate\\": " & (my jsonString(prevDefer)) & "," & ¬
      "\\"newDeferDate\\": \\"" & (my escapeJson(newDeferStr)) & "\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<DeferResult>(
    omniFocusScriptWithHelpers(script)
  );

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

  // Process in chunks
  const chunks: string[][] = [];
  for (let i = 0; i < taskIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(taskIds.slice(i, i + MAX_BATCH_SIZE));
  }

  const allSucceeded: BatchDeferItem[] = [];
  const allFailed: { id: string; error: string }[] = [];

  // Build the defer date logic
  let deferLogic: string;
  if (options.days !== undefined) {
    deferLogic = `set newDefer to rightNow + (${String(options.days)} * days)`;
  } else {
    deferLogic = `set newDefer to date "${escapeAppleScript(options.to ?? "")}"`;
  }

  for (const chunk of chunks) {
    const idsJson = JSON.stringify(chunk);

    const script = `
      set taskIdList to ${idsJson}
      set succeededList to {}
      set failedList to {}
      set rightNow to current date

      ${deferLogic}

      repeat with taskIdStr in taskIdList
        try
          set theTask to first flattened task whose id is taskIdStr

          -- Get previous defer date
          set prevDefer to ""
          try
            set prevDefer to (defer date of theTask) as string
          end try

          -- Set the defer date
          set defer date of theTask to newDefer

          -- Get the new defer date as string
          set newDeferStr to (defer date of theTask) as string

          set end of succeededList to "{" & ¬
            "\\"taskId\\": \\"" & taskIdStr & "\\"," & ¬
            "\\"taskName\\": \\"" & (my escapeJson(name of theTask)) & "\\"," & ¬
            "\\"previousDeferDate\\": " & (my jsonString(prevDefer)) & "," & ¬
            "\\"newDeferDate\\": \\"" & (my escapeJson(newDeferStr)) & "\\"" & ¬
            "}"
        on error errMsg
          set end of failedList to "{" & ¬
            "\\"id\\": \\"" & taskIdStr & "\\"," & ¬
            "\\"error\\": \\"" & (my escapeJson(errMsg)) & "\\"" & ¬
            "}"
        end try
      end repeat

      set successJson to "["
      set isFirst to true
      repeat with item_ in succeededList
        if not isFirst then set successJson to successJson & ","
        set isFirst to false
        set successJson to successJson & item_
      end repeat
      set successJson to successJson & "]"

      set failJson to "["
      set isFirst to true
      repeat with item_ in failedList
        if not isFirst then set failJson to failJson & ","
        set isFirst to false
        set failJson to failJson & item_
      end repeat
      set failJson to failJson & "]"

      return "{" & ¬
        "\\"succeeded\\": " & successJson & "," & ¬
        "\\"failed\\": " & failJson & ¬
        "}"
    `;

    const result = await runAppleScript<{
      succeeded: BatchDeferItem[];
      failed: { id: string; error: string }[];
    }>(omniFocusScriptWithHelpers(script));

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
