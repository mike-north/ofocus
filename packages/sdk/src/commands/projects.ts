import type {
  CliOutput,
  ProjectQueryOptions,
  OFProject,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runComposedScript } from "../applescript.js";
import { loadScriptContentCached } from "../asset-loader.js";

/**
 * Query projects from OmniFocus with optional filters and pagination.
 */
export async function queryProjects(
  options: ProjectQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFProject>>> {
  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

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

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  // Load external AppleScript helpers
  const [jsonHelpers, projectSerializer] = await Promise.all([
    loadScriptContentCached("helpers/json.applescript"),
    loadScriptContentCached("serializers/project.applescript"),
  ]);

  const body = `
    set output to "{\\"items\\": ["
    set isFirst to true
    set totalCount to 0
    set returnedCount to 0
    set currentIndex to 0

    set allProjects to flattened projects ${whereClause}

    repeat with p in allProjects
      set shouldInclude to true

      -- Safely determine project status (OmniFocus requires "X status" syntax)
      set projStatus to "active"
      try
        set theStatus to status of p
        if theStatus is on hold status then
          set projStatus to "on-hold"
        else if theStatus is done status then
          set projStatus to "completed"
        else if theStatus is dropped status then
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
        set totalCount to totalCount + 1

        -- Check if within pagination range
        if currentIndex >= ${String(offset)} and returnedCount < ${String(limit)} then
          if not isFirst then set output to output & ","
          set isFirst to false
          set returnedCount to returnedCount + 1

          set output to output & (my serializeProject(p))
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

  const result = await runComposedScript<PaginatedResult<OFProject>>(
    [jsonHelpers, projectSerializer],
    body
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query projects")
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
