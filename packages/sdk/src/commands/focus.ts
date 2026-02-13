import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateProjectName } from "../validation.js";
import { escapeAppleScript } from "../escape.js";
import { runAppleScript, omniFocusScriptWithHelpers } from "../applescript.js";

/**
 * Result from focus operations.
 */
export interface FocusResult {
  focused: boolean;
  targetId: string | null;
  targetName: string | null;
  targetType: "project" | "folder" | null;
}

/**
 * Validate an ID for focus operations (can be project or folder).
 */
function validateFocusId(id: string): { code: string; message: string } | null {
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
 * Focus on a specific project or folder in OmniFocus.
 * This matches the OmniFocus UI focus feature.
 */
export async function focus(
  target: string,
  options: { byId?: boolean | undefined } = {}
): Promise<CliOutput<FocusResult>> {
  // Validate input
  if (options.byId) {
    const error = validateFocusId(target);
    if (error) {
      return failure(createError(ErrorCode.INVALID_ID_FORMAT, error.message));
    }
  } else {
    const error = validateProjectName(target);
    if (error) return failure(error);
  }

  const escapedTarget = escapeAppleScript(target);

  const findScript = options.byId
    ? `
      -- Try to find by ID (could be project or folder)
      set targetItem to missing value
      set targetType to ""

      try
        set targetItem to first flattened project whose id is "${escapedTarget}"
        set targetType to "project"
      end try

      if targetItem is missing value then
        try
          set targetItem to first flattened folder whose id is "${escapedTarget}"
          set targetType to "folder"
        end try
      end if

      if targetItem is missing value then
        error "Target not found with ID: ${escapedTarget}"
      end if
    `
    : `
      -- Try to find by name (project first, then folder)
      set targetItem to missing value
      set targetType to ""

      try
        set targetItem to first flattened project whose name is "${escapedTarget}"
        set targetType to "project"
      end try

      if targetItem is missing value then
        try
          set targetItem to first flattened folder whose name is "${escapedTarget}"
          set targetType to "folder"
        end try
      end if

      if targetItem is missing value then
        error "Target not found: ${escapedTarget}"
      end if
    `;

  const script = `
    ${findScript}

    -- Get info while still in document context
    set targetId to id of targetItem
    set targetName to name of targetItem
  end tell

  -- Set focus (document window is on application, not document)
  set focused of document window 1 to {targetItem}

  tell default document
    return "{" & ¬
      "\\"focused\\": true," & ¬
      "\\"targetId\\": \\"" & targetId & "\\"," & ¬
      "\\"targetName\\": \\"" & (my escapeJson(targetName)) & "\\"," & ¬
      "\\"targetType\\": \\"" & targetType & "\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<FocusResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to focus on target")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Clear focus in OmniFocus (show all items).
 */
export async function unfocus(): Promise<CliOutput<FocusResult>> {
  const script = `
  end tell

  -- Clear focus by setting to empty list (document window is on application, not document)
  set focused of document window 1 to {}

  tell default document
    return "{" & ¬
      "\\"focused\\": false," & ¬
      "\\"targetId\\": null," & ¬
      "\\"targetName\\": null," & ¬
      "\\"targetType\\": null" & ¬
      "}"
  `;

  const result = await runAppleScript<FocusResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to clear focus")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}

/**
 * Get the current focus state in OmniFocus.
 */
export async function getFocused(): Promise<CliOutput<FocusResult>> {
  const script = `
  end tell

  -- Get focused items (document window is on application, not document)
  set focusedItems to focused of document window 1

  if (count of focusedItems) is 0 then
    tell default document
      return "{" & ¬
        "\\"focused\\": false," & ¬
        "\\"targetId\\": null," & ¬
        "\\"targetName\\": null," & ¬
        "\\"targetType\\": null" & ¬
        "}"
    end tell
  end if

  -- Get first focused item (typically only one)
  set focusedItem to item 1 of focusedItems

  set targetId to id of focusedItem
  set targetName to name of focusedItem

  -- Determine type
  set targetType to "folder"
  try
    set testStatus to status of focusedItem
    set targetType to "project"
  end try

  tell default document
    return "{" & ¬
      "\\"focused\\": true," & ¬
      "\\"targetId\\": \\"" & targetId & "\\"," & ¬
      "\\"targetName\\": \\"" & (my escapeJson(targetName)) & "\\"," & ¬
      "\\"targetType\\": \\"" & targetType & "\\"" & ¬
      "}"
  `;

  const result = await runAppleScript<FocusResult>(
    omniFocusScriptWithHelpers(script)
  );

  if (!result.success) {
    return failure(
      result.error ??
        createError(ErrorCode.UNKNOWN_ERROR, "Failed to get focus state")
    );
  }

  if (result.data === undefined) {
    return failure(createError(ErrorCode.UNKNOWN_ERROR, "No result returned"));
  }

  return success(result.data);
}
