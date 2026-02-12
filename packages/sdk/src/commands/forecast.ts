import type { CliOutput, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateDateString } from "../validation.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Options for querying forecast tasks.
 */
export interface ForecastOptions {
  /** Start date for the forecast range (defaults to today) */
  start?: string | undefined;
  /** End date for the forecast range */
  end?: string | undefined;
  /** Number of days from start to include (alternative to end) */
  days?: number | undefined;
  /** Include tasks with no due date but deferred to the range */
  includeDeferred?: boolean | undefined;
}

/**
 * Query tasks by date range, similar to OmniFocus Forecast view.
 * Returns tasks that are due or deferred within the specified date range.
 */
export async function queryForecast(
  options: ForecastOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate date inputs
  if (options.start !== undefined) {
    const error = validateDateString(options.start);
    if (error) return failure(error);
  }

  if (options.end !== undefined) {
    const error = validateDateString(options.end);
    if (error) return failure(error);
  }

  // Validate days option
  if (
    options.days !== undefined &&
    (options.days < 1 || !Number.isInteger(options.days))
  ) {
    return failure(
      createError(ErrorCode.VALIDATION_ERROR, "Days must be a positive integer")
    );
  }

  // Build date range logic in AppleScript
  const startDate = options.start ?? "today";
  const includeDeferred = options.includeDeferred === true;

  // Calculate end date based on days or explicit end
  let endDateLogic: string;
  if (options.end !== undefined) {
    endDateLogic = `set endDate to date "${options.end}"`;
  } else if (options.days !== undefined) {
    endDateLogic = `set endDate to startDate + (${String(options.days)} * days)`;
  } else {
    // Default to 7 days
    endDateLogic = `set endDate to startDate + (7 * days)`;
  }

  const script = `
    set startDate to date "${startDate}"
    ${endDateLogic}

    set output to "["
    set isFirst to true

    set allTasks to flattened tasks where completed is false and effectively dropped is false

    repeat with t in allTasks
      set shouldInclude to false

      -- Check due date
      try
        set taskDue to due date of t
        if taskDue >= startDate and taskDue <= endDate then
          set shouldInclude to true
        end if
      end try

      ${
        includeDeferred
          ? `
      -- Check defer date
      if not shouldInclude then
        try
          set taskDefer to defer date of t
          if taskDefer >= startDate and taskDefer <= endDate then
            set shouldInclude to true
          end if
        end try
      end if
      `
          : ""
      }

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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query forecast")
    );
  }

  return success(result.data ?? []);
}
