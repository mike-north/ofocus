import type {
  CliOutput,
  ProjectQueryOptions,
  OFProject,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Query projects from OmniFocus with optional filters.
 */
export async function queryProjects(
  options: ProjectQueryOptions = {}
): Promise<CliOutput<OFProject[]>> {
  // Build filter conditions for properties that work in where clauses
  const conditions: string[] = [];

  if (options.sequential === true) {
    conditions.push("sequential is true");
  } else if (options.sequential === false) {
    conditions.push("sequential is false");
  }

  const whereClause =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  // Map status option to AppleScript status value
  let statusFilter = "";
  if (options.status !== undefined) {
    switch (options.status) {
      case "active":
        statusFilter = "active status";
        break;
      case "on-hold":
        statusFilter = "on hold";
        break;
      case "completed":
        statusFilter = "done";
        break;
      case "dropped":
        statusFilter = "dropped";
        break;
    }
  }

  const script = `
    set output to "["
    set isFirst to true

    set allProjects to flattened projects ${whereClause}

    repeat with p in allProjects
      set shouldInclude to true

      -- Safely determine project status (OmniFocus has issues with direct status comparisons)
      set projStatus to "active"
      try
        set theStatus to status of p
        if theStatus is on hold then
          set projStatus to "on-hold"
        else if theStatus is done then
          set projStatus to "completed"
        else if theStatus is dropped then
          set projStatus to "dropped"
        end if
      end try

      ${statusFilter === "active status" ? `if projStatus is not "active" then set shouldInclude to false` : ""}
      ${statusFilter === "on hold" ? `if projStatus is not "on-hold" then set shouldInclude to false` : ""}
      ${statusFilter === "done" ? `if projStatus is not "completed" then set shouldInclude to false` : ""}
      ${statusFilter === "dropped" ? `if projStatus is not "dropped" then set shouldInclude to false` : ""}

      ${options.folder ? `-- Filter by folder` : ""}
      ${options.folder ? `try` : ""}
      ${options.folder ? `  if name of folder of p is not "${escapeAppleScript(options.folder)}" then set shouldInclude to false` : ""}
      ${options.folder ? `on error` : ""}
      ${options.folder ? `  set shouldInclude to false` : ""}
      ${options.folder ? `end try` : ""}

      if shouldInclude then
        if not isFirst then set output to output & ","
        set isFirst to false

        set projId to id of p
        set projName to name of p
        set projNote to note of p
        set projSeq to sequential of p

        set folderId to ""
        set folderName to ""
        try
          set f to folder of p
          set folderId to id of f
          set folderName to name of f
        end try

        set taskCount to count of tasks of p
        set remainingCount to count of (tasks of p where completed is false)

        set output to output & "{" & ¬
          "\\"id\\": \\"" & projId & "\\"," & ¬
          "\\"name\\": \\"" & (my escapeJson(projName)) & "\\"," & ¬
          "\\"note\\": " & (my jsonString(projNote)) & "," & ¬
          "\\"status\\": \\"" & projStatus & "\\"," & ¬
          "\\"sequential\\": " & projSeq & "," & ¬
          "\\"folderId\\": " & (my jsonString(folderId)) & "," & ¬
          "\\"folderName\\": " & (my jsonString(folderName)) & "," & ¬
          "\\"taskCount\\": " & taskCount & "," & ¬
          "\\"remainingTaskCount\\": " & remainingCount & ¬
          "}"
      end if
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFProject[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query projects")
    );
  }

  return success(result.data ?? []);
}
