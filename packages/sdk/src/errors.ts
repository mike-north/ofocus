/**
 * Error codes for semantic error handling.
 */
export const ErrorCode = {
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TAG_NOT_FOUND: "TAG_NOT_FOUND",
  FOLDER_NOT_FOUND: "FOLDER_NOT_FOUND",
  PERSPECTIVE_NOT_FOUND: "PERSPECTIVE_NOT_FOUND",
  DUPLICATE_NAME: "DUPLICATE_NAME",
  OMNIFOCUS_NOT_RUNNING: "OMNIFOCUS_NOT_RUNNING",
  INVALID_DATE_FORMAT: "INVALID_DATE_FORMAT",
  INVALID_ID_FORMAT: "INVALID_ID_FORMAT",
  INVALID_REPETITION_RULE: "INVALID_REPETITION_RULE",
  SCRIPT_ERROR: "SCRIPT_ERROR",
  JSON_PARSE_ERROR: "JSON_PARSE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error representation for CLI output.
 */
export interface CliError {
  code: ErrorCode;
  message: string;
  details?: string;
}

/**
 * Create a CliError with the given code and message.
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: string
): CliError {
  return details !== undefined ? { code, message, details } : { code, message };
}

/**
 * Parse a script-layer error message (from the OmniJS execution bridge or the
 * underlying osascript host) into a structured CliError.
 *
 * Recognized message shapes:
 * - `Error: <Entity> not found` — thrown from inside the OmniJS body when
 *   `Task.byIdentifier(...)` or similar returns `null`.
 * - osascript transport errors when OmniFocus is not running.
 */
export function parseScriptError(rawError: string): CliError {
  const errorLower = rawError.toLowerCase();

  if (
    errorLower.includes("application isn't running") ||
    errorLower.includes("connection is invalid") ||
    errorLower.includes("not running")
  ) {
    return createError(
      ErrorCode.OMNIFOCUS_NOT_RUNNING,
      "OmniFocus is not running",
      rawError
    );
  }

  if (errorLower.includes("task not found")) {
    return createError(ErrorCode.TASK_NOT_FOUND, "Task not found", rawError);
  }

  if (errorLower.includes("project not found")) {
    return createError(
      ErrorCode.PROJECT_NOT_FOUND,
      "Project not found",
      rawError
    );
  }

  if (errorLower.includes("tag not found")) {
    return createError(ErrorCode.TAG_NOT_FOUND, "Tag not found", rawError);
  }

  if (errorLower.includes("folder not found")) {
    return createError(
      ErrorCode.FOLDER_NOT_FOUND,
      "Folder not found",
      rawError
    );
  }

  if (errorLower.includes("perspective not found")) {
    return createError(
      ErrorCode.PERSPECTIVE_NOT_FOUND,
      "Perspective not found",
      rawError
    );
  }

  return createError(ErrorCode.SCRIPT_ERROR, "Script execution failed", rawError);
}
