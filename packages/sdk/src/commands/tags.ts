import type { CliOutput, TagQueryOptions, OFTag } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { escapeAppleScript } from "../escape.js";
import {
  runAppleScript,
  omniFocusScriptWithHelpers,
} from "../applescript.js";

/**
 * Query tags from OmniFocus with optional filters.
 */
export async function queryTags(
  options: TagQueryOptions = {}
): Promise<CliOutput<OFTag[]>> {
  const script = `
    set output to "["
    set isFirst to true

    set allTags to flattened tags

    repeat with theTag in allTags
      ${options.parent ? `set parentMatch to false` : ""}
      ${options.parent ? `try` : ""}
      ${options.parent ? `  set theContainer to container of theTag` : ""}
      ${options.parent ? `  if name of theContainer is "${escapeAppleScript(options.parent)}" then set parentMatch to true` : ""}
      ${options.parent ? `end try` : ""}
      ${options.parent ? `if parentMatch then` : ""}

      if not isFirst then set output to output & ","
      set isFirst to false

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

      ${options.parent ? "end if" : ""}
    end repeat

    return output & "]"
  `;

  const result = await runAppleScript<OFTag[]>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to query tags")
    );
  }

  return success(result.data ?? []);
}
