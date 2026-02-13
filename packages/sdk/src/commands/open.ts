import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateId } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Result from opening an item.
 */
export interface OpenResult {
  id: string;
  type: "task" | "project" | "folder" | "tag";
  name: string;
  opened: true;
}

/**
 * Open an item in the OmniFocus UI.
 * The item can be a task, project, folder, or tag.
 * Auto-detects the item type based on the ID.
 */
export async function openItem(id: string): Promise<CliOutput<OpenResult>> {
  // Validate ID
  const idError = validateId(id, "item");
  if (idError) return failure(idError);

  // Try to find the item and determine its type, then open it
  const script = `
    set itemId to "${escapeAppleScript(id)}"
    set itemType to ""
    set itemName to ""
    set foundItem to missing value

    -- Try to find as task first (most common)
    try
      set foundItem to first flattened task whose id is itemId
      set itemType to "task"
      set itemName to name of foundItem
    end try

    -- Try as project
    if foundItem is missing value then
      try
        set foundItem to first flattened project whose id is itemId
        set itemType to "project"
        set itemName to name of foundItem
      end try
    end if

    -- Try as folder
    if foundItem is missing value then
      try
        set foundItem to first flattened folder whose id is itemId
        set itemType to "folder"
        set itemName to name of foundItem
      end try
    end if

    -- Try as tag
    if foundItem is missing value then
      try
        set foundItem to first flattened tag whose id is itemId
        set itemType to "tag"
        set itemName to name of foundItem
      end try
    end if

    if foundItem is missing value then
      error "Item not found with ID: " & itemId
    end if

    -- Activate OmniFocus and open the item using URL scheme
    tell application "OmniFocus"
      activate
    end tell

    -- Use URL scheme to navigate to the item
    -- OmniFocus URL scheme: omnifocus:///task/ID, omnifocus:///project/ID, etc.
    set urlType to itemType
    if urlType is "task" then
      set urlType to "task"
    else if urlType is "project" then
      set urlType to "project"
    else if urlType is "folder" then
      set urlType to "folder"
    else if urlType is "tag" then
      set urlType to "tag"
    end if

    set theUrl to "omnifocus:///" & urlType & "/" & itemId
    do shell script "open " & quoted form of theUrl

    return "{" & ¬
      "\\"id\\": \\"" & itemId & "\\"," & ¬
      "\\"type\\": \\"" & itemType & "\\"," & ¬
      "\\"name\\": \\"" & (my escapeJson(itemName)) & "\\"," & ¬
      "\\"opened\\": true" & ¬
      "}"
  `;

  const result = await runAppleScript<OpenResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to open item")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}
