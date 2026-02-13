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
  APPLESCRIPT_ERROR: "APPLESCRIPT_ERROR",
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
 * Parse an AppleScript error message into a structured CliError.
 * Detects common error patterns and maps them to appropriate error codes.
 */
export function parseAppleScriptError(rawError: string): CliError {
  const errorLower = rawError.toLowerCase();

  // OmniFocus not running
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

  // Task not found
  if (
    errorLower.includes("can't get first flattened task") ||
    errorLower.includes("no task") ||
    (errorLower.includes("task") && errorLower.includes("doesn't exist"))
  ) {
    return createError(ErrorCode.TASK_NOT_FOUND, "Task not found", rawError);
  }

  // Project not found
  if (
    errorLower.includes("can't get first flattened project") ||
    errorLower.includes("no project") ||
    (errorLower.includes("project") && errorLower.includes("doesn't exist"))
  ) {
    return createError(
      ErrorCode.PROJECT_NOT_FOUND,
      "Project not found",
      rawError
    );
  }

  // Tag not found
  if (
    errorLower.includes("can't get first flattened tag") ||
    errorLower.includes("no tag") ||
    (errorLower.includes("tag") && errorLower.includes("doesn't exist"))
  ) {
    return createError(ErrorCode.TAG_NOT_FOUND, "Tag not found", rawError);
  }

  // Folder not found
  if (
    errorLower.includes("can't get first flattened folder") ||
    errorLower.includes("can't get folder") ||
    errorLower.includes("no folder") ||
    (errorLower.includes("folder") && errorLower.includes("doesn't exist"))
  ) {
    return createError(
      ErrorCode.FOLDER_NOT_FOUND,
      "Folder not found",
      rawError
    );
  }

  // Perspective not found
  if (
    errorLower.includes("can't get perspective") ||
    errorLower.includes("no perspective") ||
    (errorLower.includes("perspective") && errorLower.includes("doesn't exist"))
  ) {
    return createError(
      ErrorCode.PERSPECTIVE_NOT_FOUND,
      "Perspective not found",
      rawError
    );
  }

  // Invalid date
  if (
    errorLower.includes("can't make") &&
    errorLower.includes("into type date")
  ) {
    return createError(
      ErrorCode.INVALID_DATE_FORMAT,
      "Invalid date format",
      rawError
    );
  }

  // Generic AppleScript error
  return createError(
    ErrorCode.APPLESCRIPT_ERROR,
    "AppleScript execution failed",
    rawError
  );
}
