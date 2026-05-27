import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import { validateProjectName } from "../validation.js";
import { runOmniJSWrapped, escapeJSString } from "../omnijs.js";

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
 *
 * @see https://omni-automation.com/omnifocus/document-window.html
 */
export async function focusOn(
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

  const escapedTarget = escapeJSString(target);

  // Build lookup script: try project first, then folder
  const lookupScript = options.byId
    ? `
var targetItem = null;
var targetType = null;

var proj = flattenedProjects.byIdentifier("${escapedTarget}");
if (proj) {
  targetItem = proj;
  targetType = "project";
} else {
  var folder = flattenedFolders.byIdentifier("${escapedTarget}");
  if (folder) {
    targetItem = folder;
    targetType = "folder";
  }
}

if (!targetItem) {
  throw new Error("Target not found with ID: ${escapedTarget}");
}`
    : `
var targetItem = null;
var targetType = null;

var proj = flattenedProjects.byName("${escapedTarget}");
if (proj) {
  targetItem = proj;
  targetType = "project";
} else {
  var folder = flattenedFolders.byName("${escapedTarget}");
  if (folder) {
    targetItem = folder;
    targetType = "folder";
  }
}

if (!targetItem) {
  throw new Error("Target not found: ${escapedTarget}");
}`;

  const body = `
${lookupScript}

var targetId = targetItem.id.primaryKey;
var targetName = targetItem.name;

var win = document.windows[0];
if (!win) {
  throw new Error("No OmniFocus window is open");
}
win.focus = [targetItem];

return JSON.stringify({
  focused: true,
  targetId: targetId,
  targetName: targetName,
  targetType: targetType
});`;

  const result = await runOmniJSWrapped<FocusResult>(body);

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
 *
 * @see https://omni-automation.com/omnifocus/document-window.html
 */
export async function unfocus(): Promise<CliOutput<FocusResult>> {
  const body = `
var win = document.windows[0];
if (!win) {
  throw new Error("No OmniFocus window is open");
}
win.focus = [];

return JSON.stringify({
  focused: false,
  targetId: null,
  targetName: null,
  targetType: null
});`;

  const result = await runOmniJSWrapped<FocusResult>(body);

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
 *
 * @see https://omni-automation.com/omnifocus/document-window.html
 */
export async function getFocused(): Promise<CliOutput<FocusResult>> {
  const body = `
var win = document.windows[0];
if (!win) {
  throw new Error("No OmniFocus window is open");
}

var focusedItems = win.focus;

if (!focusedItems || focusedItems.length === 0) {
  return JSON.stringify({
    focused: false,
    targetId: null,
    targetName: null,
    targetType: null
  });
}

// Get first focused item (typically only one)
var focusedItem = focusedItems[0];
var targetId = focusedItem.id.primaryKey;
var targetName = focusedItem.name;

// Determine type: Projects have a "status" property; Folders do not
var targetType = (typeof focusedItem.status !== "undefined") ? "project" : "folder";

return JSON.stringify({
  focused: true,
  targetId: targetId,
  targetName: targetName,
  targetType: targetType
});`;

  const result = await runOmniJSWrapped<FocusResult>(body);

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
