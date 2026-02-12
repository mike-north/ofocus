import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Result from URL generation.
 */
export interface UrlResult {
  id: string;
  type: "task" | "project" | "folder" | "tag";
  url: string;
  name: string;
}

/**
 * Validate an ID for URL operations (can be any OmniFocus item type).
 */
function validateUrlId(id: string): { code: string; message: string } | null {
  if (!id || id.trim() === "") {
    return { code: "INVALID_ID_FORMAT", message: "ID cannot be empty" };
  }

  // IDs should be alphanumeric with possible dashes/underscores
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(id)) {
    return {
      code: "INVALID_ID_FORMAT",
      message: `Invalid ID format: ${id}`,
    };
  }

  return null;
}

/**
 * Generate an OmniFocus URL scheme deep link for a task, project, folder, or tag.
 * Returns the omnifocus:/// URL that can be used to open the item in OmniFocus.
 */
export async function generateUrl(id: string): Promise<CliOutput<UrlResult>> {
  // Validate ID
  const error = validateUrlId(id);
  if (error) {
    return failure(createError(ErrorCode.INVALID_ID_FORMAT, error.message));
  }

  const script = `
    set itemId to "${id}"
    set itemType to ""
    set itemName to ""
    set itemUrl to ""

    -- Try task first
    try
      set theItem to first flattened task whose id is itemId
      set itemType to "task"
      set itemName to name of theItem
      set itemUrl to "omnifocus:///task/" & itemId
    end try

    -- Try project
    if itemType is "" then
      try
        set theItem to first flattened project whose id is itemId
        set itemType to "project"
        set itemName to name of theItem
        set itemUrl to "omnifocus:///project/" & itemId
      end try
    end if

    -- Try folder
    if itemType is "" then
      try
        set theItem to first flattened folder whose id is itemId
        set itemType to "folder"
        set itemName to name of theItem
        set itemUrl to "omnifocus:///folder/" & itemId
      end try
    end if

    -- Try tag
    if itemType is "" then
      try
        set theItem to first flattened tag whose id is itemId
        set itemType to "tag"
        set itemName to name of theItem
        set itemUrl to "omnifocus:///tag/" & itemId
      end try
    end if

    if itemType is "" then
      error "Item not found with ID: " & itemId
    end if

    return "{" & ¬
      "\\"id\\": \\"" & itemId & "\\"," & ¬
      "\\"type\\": \\"" & itemType & "\\"," & ¬
      "\\"url\\": \\"" & itemUrl & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(itemName)) & "\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<UrlResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to generate URL")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}
