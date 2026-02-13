import type {
  CliOutput,
  TaskQueryOptions,
  OFTask,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  validateDateString,
  validateProjectName,
  validatePaginationParams,
} from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Query tasks from OmniFocus with optional filters and pagination.
 */
export async function queryTasks(
  options: TaskQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFTask>>> {
  // Validate inputs
  if (options.dueBefore !== undefined) {
    const dateError = validateDateString(options.dueBefore);
    if (dateError) return failure(dateError);
  }

  if (options.dueAfter !== undefined) {
    const dateError = validateDateString(options.dueAfter);
    if (dateError) return failure(dateError);
  }

  const projectError = validateProjectName(options.project);
  if (projectError) return failure(projectError);

  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Build filter conditions
  const conditions: string[] = [];

  if (options.completed === true) {
    conditions.push("completed is true");
  } else if (options.completed === false) {
    conditions.push("completed is false");
  }

  if (options.flagged === true) {
    conditions.push("flagged is true");
  }

  if (options.available === true) {
    conditions.push("completed is false");
    conditions.push("effectively dropped is false");
    conditions.push("blocked is false");
  }

  // Project filter handled separately in script
  // Tag filter handled separately in script
  // Date filters handled separately in script

  const whereClause =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const script = `
    set output to "{\\"items\\": ["
    set isFirst to true
    set totalCount to 0
    set returnedCount to 0
    set currentIndex to 0

    set allTasks to flattened tasks ${whereClause}

    -- First pass: count matching items and collect within pagination range
    repeat with t in allTasks
      -- Apply additional filters
      set shouldInclude to true

      ${options.project ? `-- Filter by project (inbox tasks have no containing project)` : ""}
      ${options.project ? `try` : ""}
      ${options.project ? `  if name of containing project of t is not "${escapeAppleScript(options.project)}" then set shouldInclude to false` : ""}
      ${options.project ? `on error` : ""}
      ${options.project ? `  set shouldInclude to false` : ""}
      ${options.project ? `end try` : ""}

      ${options.tag ? `-- Filter by tag` : ""}
      ${options.tag ? `if shouldInclude then` : ""}
      ${options.tag ? `  set hasTag to false` : ""}
      ${options.tag ? `  repeat with tg in tags of t` : ""}
      ${options.tag ? `    if name of tg is "${escapeAppleScript(options.tag)}" then set hasTag to true` : ""}
      ${options.tag ? `  end repeat` : ""}
      ${options.tag ? `  if not hasTag then set shouldInclude to false` : ""}
      ${options.tag ? `end if` : ""}

      ${options.dueBefore ? `-- Filter by due before` : ""}
      ${options.dueBefore ? `if shouldInclude then` : ""}
      ${options.dueBefore ? `  try` : ""}
      ${options.dueBefore ? `    set taskDue to due date of t` : ""}
      ${options.dueBefore ? `    if taskDue > date "${options.dueBefore}" then set shouldInclude to false` : ""}
      ${options.dueBefore ? `  on error` : ""}
      ${options.dueBefore ? `    set shouldInclude to false` : ""}
      ${options.dueBefore ? `  end try` : ""}
      ${options.dueBefore ? `end if` : ""}

      ${options.dueAfter ? `-- Filter by due after` : ""}
      ${options.dueAfter ? `if shouldInclude then` : ""}
      ${options.dueAfter ? `  try` : ""}
      ${options.dueAfter ? `    set taskDue to due date of t` : ""}
      ${options.dueAfter ? `    if taskDue < date "${options.dueAfter}" then set shouldInclude to false` : ""}
      ${options.dueAfter ? `  on error` : ""}
      ${options.dueAfter ? `    set shouldInclude to false` : ""}
      ${options.dueAfter ? `  end try` : ""}
      ${options.dueAfter ? `end if` : ""}

      if shouldInclude then
        set totalCount to totalCount + 1

        -- Check if within pagination range
        if currentIndex >= ${String(offset)} and returnedCount < ${String(limit)} then
          if not isFirst then set output to output & ","
          set isFirst to false
          set returnedCount to returnedCount + 1

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

        set currentIndex to currentIndex + 1
      end if
    end repeat

    set hasMore to (totalCount > (${String(offset)} + returnedCount))

    set output to output & "]," & ¬
      "\\"totalCount\\": " & totalCount & "," & ¬
      "\\"returnedCount\\": " & returnedCount & "," & ¬
      "\\"hasMore\\": " & hasMore & "," & ¬
      "\\"offset\\": ${String(offset)}," & ¬
      "\\"limit\\": ${String(limit)}" & ¬
      "}"

    return output
  `;

  const result = await runAppleScript<PaginatedResult<OFTask>>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tasks")
    );
  }

  return success(
    result.data ?? {
      items: [],
      totalCount: 0,
      returnedCount: 0,
      hasMore: false,
      offset,
      limit,
    }
  );
}
