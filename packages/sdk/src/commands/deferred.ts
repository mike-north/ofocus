import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Options for querying deferred tasks.
 */
export interface DeferredQueryOptions {
  /** Include tasks deferred until after this date */
  deferredAfter?: string | undefined;
  /** Include tasks deferred until before this date */
  deferredBefore?: string | undefined;
  /** Only show tasks that are currently blocked by defer date */
  blockedOnly?: boolean | undefined;
}

/**
 * Query all deferred tasks from OmniFocus.
 * Returns tasks that have a defer date set.
 */
export async function queryDeferred(
  options: DeferredQueryOptions = {}
): Promise<CliOutput<OFTask[]>> {
  const blockedOnly = options.blockedOnly === true;

  const script = `
    set output to "["
    set isFirst to true
    set rightNow to current date

    set allTasks to flattened tasks where completed is false and effectively dropped is false

    repeat with t in allTasks
      set shouldInclude to false

      -- Check if task has defer date
      try
        set taskDefer to defer date of t
        if taskDefer is not missing value then
          set shouldInclude to true

          ${
            blockedOnly
              ? `
          -- Only include if defer date is in the future (currently blocked)
          if taskDefer <= rightNow then
            set shouldInclude to false
          end if
          `
              : ""
          }

          ${
            options.deferredAfter
              ? `
          -- Filter by deferred after
          if shouldInclude and taskDefer < date "${options.deferredAfter}" then
            set shouldInclude to false
          end if
          `
              : ""
          }

          ${
            options.deferredBefore
              ? `
          -- Filter by deferred before
          if shouldInclude and taskDefer > date "${options.deferredBefore}" then
            set shouldInclude to false
          end if
          `
              : ""
          }
        end if
      end try

      if shouldInclude then
        if not isFirst then set output to output & ","
        set isFirst to false

        set taskId to id of t
        set taskName to name of t
        set taskNote to note of t
        set taskFlagged to flagged of t
        set taskCompleted to completed of t

        set dueStr to ""
        try
          set dueStr to (due date of t) as string
        end try

        set deferStr to ""
        try
          set deferStr to (defer date of t) as string
        end try

        set completionStr to ""
        try
          set completionStr to (completion date of t) as string
        end try

        set projId to ""
        set projName to ""
        try
          set proj to containing project of t
          set projId to id of proj
          set projName to name of proj
        end try

        set tagNames to {}
        repeat with tg in tags of t
          set end of tagNames to name of tg
        end repeat

        set estMinutes to 0
        try
          set estMinutes to estimated minutes of t
          if estMinutes is missing value then set estMinutes to 0
        end try

        set output to output & "{" & ¬
          "\\"id\\": \\"" & taskId & "\\"," & ¬
          "\\"name\\": \\"" & (my escapeJson(taskName)) & "\\"," & ¬
          "\\"note\\": " & (my jsonString(taskNote)) & "," & ¬
          "\\"flagged\\": " & taskFlagged & "," & ¬
          "\\"completed\\": " & taskCompleted & "," & ¬
          "\\"dueDate\\": " & (my jsonString(dueStr)) & "," & ¬
          "\\"deferDate\\": " & (my jsonString(deferStr)) & "," & ¬
          "\\"completionDate\\": " & (my jsonString(completionStr)) & "," & ¬
          "\\"projectId\\": " & (my jsonString(projId)) & "," & ¬
          "\\"projectName\\": " & (my jsonString(projName)) & "," & ¬
          "\\"tags\\": " & (my jsonArray(tagNames)) & "," & ¬
          "\\"estimatedMinutes\\": " & estMinutes & ¬
          "}"
      end if
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFTask[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query deferred tasks")
    );
  }

  return success(result.data ?? []);
}
