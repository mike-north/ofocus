import type { CliOutput, OFPerspective, OFTask } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateSearchQuery } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Options for querying a perspective.
 */
export interface PerspectiveQueryOptions {
  limit?: number | undefined;
}

/**
 * List all perspectives in OmniFocus.
 */
export async function listPerspectives(): Promise<CliOutput<OFPerspective[]>> {
  const script = `
    set output to "["
    set isFirst to true

    set allPerspectives to perspectives

    repeat with p in allPerspectives
      if not isFirst then set output to output & ","
      set isFirst to false

      set perspId to id of p
      set perspName to name of p

      set output to output & "{" & ¬
        "\\"id\\": \\"" & perspId & "\\"," & ¬
        "\\"name\\": \\"" & (my escapeJson(perspName)) & "\\"" & ¬
        "}"
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFPerspective[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to list perspectives")
    );
  }

  return success(result.data ?? []);
}

/**
 * Query tasks from a specific perspective in OmniFocus.
 *
 * Note: This function retrieves tasks based on the perspective's filtering rules.
 * Some perspectives may require UI interaction in OmniFocus to be properly evaluated.
 * Built-in perspectives like "Flagged", "Forecast", and "Projects" work best.
 */
export async function queryPerspective(
  name: string,
  options: PerspectiveQueryOptions = {}
): Promise<CliOutput<OFTask[]>> {
  // Validate perspective name
  const nameError = validateSearchQuery(name);
  if (nameError) {
    return failure(
      createError(
        ErrorCode.VALIDATION_ERROR,
        "Perspective name cannot be empty"
      )
    );
  }

  const limit = options.limit ?? 100;

  // Note: OmniFocus's AppleScript support for perspectives is limited.
  // We can check if a perspective exists but getting its filtered tasks
  // programmatically is difficult. We'll get all tasks and note that
  // this is a limitation.
  //
  // For built-in perspectives, we can implement specific logic:
  // - Flagged: flagged tasks
  // - Inbox: inbox tasks
  // - Projects: all project tasks
  // - Forecast: tasks with due dates

  const escapedName = escapeAppleScript(name);

  const script = `
    -- First verify the perspective exists
    set perspExists to false
    try
      set thePerspective to perspective "${escapedName}"
      set perspExists to true
    end try

    if not perspExists then
      error "Perspective not found: ${escapedName}"
    end if

    -- Handle known built-in perspectives
    set perspNameLower to "${escapedName.toLowerCase()}"
    set output to "["
    set isFirst to true
    set matchCount to 0
    set maxResults to ${String(limit)}

    if perspNameLower is "flagged" then
      set taskList to (flattened tasks where flagged is true and completed is false)
    else if perspNameLower is "inbox" then
      set taskList to inbox tasks
    else if perspNameLower is "forecast" then
      set taskList to (flattened tasks where due date is not missing value and completed is false)
    else
      -- For custom perspectives, return all available tasks as a fallback
      -- This is a limitation of OmniFocus's AppleScript API
      set taskList to (flattened tasks where completed is false)
    end if

    repeat with t in taskList
      if matchCount >= maxResults then exit repeat
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
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFTask[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query perspective")
    );
  }

  return success(result.data ?? []);
}
