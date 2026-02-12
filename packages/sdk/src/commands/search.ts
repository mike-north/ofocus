import type { CliOutput, SearchOptions, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateSearchQuery } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Search tasks in OmniFocus.
 */
export async function searchTasks(
  query: string,
  options: SearchOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate search query
  const queryError = validateSearchQuery(query);
  if (queryError) return failure(queryError);

  const scope = options.scope ?? "both";
  const limit = options.limit ?? 100;
  const includeCompleted = options.includeCompleted ?? false;

  // Build the search script
  // OmniFocus doesn't have a built-in full-text search, so we do it manually
  const escapedQuery = escapeAppleScript(query.toLowerCase());

  // Build filter conditions based on scope
  let searchCondition: string;
  switch (scope) {
    case "name":
      searchCondition = `(my containsText(name of t, "${escapedQuery}"))`;
      break;
    case "note":
      searchCondition = `(my containsText(note of t, "${escapedQuery}"))`;
      break;
    default:
      // "both"
      searchCondition = `(my containsText(name of t, "${escapedQuery}") or my containsText(note of t, "${escapedQuery}"))`;
      break;
  }

  const completedFilter = includeCompleted
    ? ""
    : "if completed of t is true then set shouldInclude to false";

  const script = `
    -- Helper function to check if a string contains another string (case-insensitive)
    on containsText(theText, searchText)
      if theText is missing value then return false
      set theTextLower to (my toLowerCase(theText as string))
      return theTextLower contains searchText
    end containsText

    on toLowerCase(theText)
      set lowercaseChars to "abcdefghijklmnopqrstuvwxyz"
      set uppercaseChars to "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      set resultText to ""
      repeat with c in theText
        set charIndex to offset of c in uppercaseChars
        if charIndex > 0 then
          set resultText to resultText & (character charIndex of lowercaseChars)
        else
          set resultText to resultText & c
        end if
      end repeat
      return resultText
    end toLowerCase

    set output to "["
    set isFirst to true
    set matchCount to 0
    set maxResults to ${String(limit)}

    set allTasks to flattened tasks

    repeat with t in allTasks
      if matchCount >= maxResults then exit repeat

      set shouldInclude to false

      try
        if ${searchCondition} then set shouldInclude to true
      end try

      ${completedFilter}

      if shouldInclude then
        set matchCount to matchCount + 1

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
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to search tasks")
    );
  }

  return success(result.data ?? []);
}
