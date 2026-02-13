import type {
  CliOutput,
  TagQueryOptions,
  OFTag,
  PaginatedResult,
} from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validatePaginationParams } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Query tags from OmniFocus with optional filters and pagination.
 */
export async function queryTags(
  options: TagQueryOptions = {}
): Promise<CliOutput<PaginatedResult<OFTag>>> {
  // Validate pagination parameters
  const paginationError = validatePaginationParams(
    options.limit,
    options.offset
  );
  if (paginationError) return failure(paginationError);

  // Pagination defaults
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const script = `
    set output to "{\\"items\\": ["
    set isFirst to true
    set totalCount to 0
    set returnedCount to 0
    set currentIndex to 0

    set allTags to flattened tags

    repeat with theTag in allTags
      set shouldInclude to true

      ${options.parent ? `-- Filter by parent tag` : ""}
      ${options.parent ? `try` : ""}
      ${options.parent ? `  set theContainer to container of theTag` : ""}
      ${options.parent ? `  if name of theContainer is not "${escapeAppleScript(options.parent)}" then set shouldInclude to false` : ""}
      ${options.parent ? `on error` : ""}
      ${options.parent ? `  set shouldInclude to false` : ""}
      ${options.parent ? `end try` : ""}

      if shouldInclude then
        set totalCount to totalCount + 1

        -- Check if within pagination range
        if currentIndex >= ${String(offset)} and returnedCount < ${String(limit)} then
          if not isFirst then set output to output & ","
          set isFirst to false
          set returnedCount to returnedCount + 1

          set tagId to id of theTag
          set tagName to name of theTag

          set parentId to ""
          set parentName to ""
          try
            set theContainer to container of theTag
            set parentId to id of theContainer
            set parentName to name of theContainer
          on error
            -- No parent or container is not a tag
          end try

          set availCount to count of (available tasks of theTag)

          set output to output & "{" & ¬
            "\\"id\\": \\"" & tagId & "\\"," & ¬
            "\\"name\\": \\"" & (my escapeJson(tagName)) & "\\"," & ¬
            "\\"parentId\\": " & (my jsonString(parentId)) & "," & ¬
            "\\"parentName\\": " & (my jsonString(parentName)) & "," & ¬
            "\\"availableTaskCount\\": " & availCount & ¬
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

  const result = await runAppleScript<PaginatedResult<OFTag>>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tags")
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
