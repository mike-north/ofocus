import { type CliError, ErrorCode, createError } from "./errors.js";

/**
 * Validate an OmniFocus ID string.
 * IDs are alphanumeric with possible dashes/underscores.
 * Returns null if valid, or a CliError if invalid.
 */
export function validateId(
  id: string,
  type: "task" | "project" | "tag" | "folder" | "item"
): CliError | null {
  if (!id || id.trim() === "") {
    return createError(
      ErrorCode.INVALID_ID_FORMAT,
      `${capitalize(type)} ID cannot be empty`
    );
  }

  // OmniFocus IDs are typically alphanumeric with possible dashes/underscores
  // They should not contain special characters that could be used for injection
  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(id)) {
    return createError(
      ErrorCode.INVALID_ID_FORMAT,
      `Invalid ${type} ID format: ${id}`,
      "IDs must contain only alphanumeric characters, dashes, and underscores"
    );
  }

  return null;
}

/**
 * Validate a date string for use with AppleScript.
 * Returns null if valid (or empty), or a CliError if invalid.
 *
 * Note: We do basic validation here; the actual date parsing
 * is done by AppleScript and more detailed errors come from there.
 */
export function validateDateString(dateStr: string): CliError | null {
  // Empty dates are valid (used to clear a date)
  if (!dateStr || dateStr.trim() === "") {
    return null;
  }

  // Check for obvious injection attempts
  // AppleScript date strings should not contain quotes or backslashes
  if (dateStr.includes('"') || dateStr.includes("\\")) {
    return createError(
      ErrorCode.INVALID_DATE_FORMAT,
      "Invalid characters in date string",
      "Date strings cannot contain quotes or backslashes"
    );
  }

  // Basic format check - should look like a date
  // AppleScript accepts various formats like "January 1, 2024" or "1/1/2024 5:00 PM"
  // We allow letters, numbers, spaces, slashes, colons, commas, and dashes
  const datePattern = /^[a-zA-Z0-9\s/:,.-]+$/;
  if (!datePattern.test(dateStr)) {
    return createError(
      ErrorCode.INVALID_DATE_FORMAT,
      `Invalid date format: ${dateStr}`
    );
  }

  return null;
}

/**
 * Validate a list of tag names.
 * Returns null if valid, or a CliError if any tag is invalid.
 */
export function validateTags(tags: string[] | undefined): CliError | null {
  if (!tags || tags.length === 0) {
    return null;
  }

  for (const tag of tags) {
    if (!tag || tag.trim() === "") {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        "Tag name cannot be empty"
      );
    }

    // Tag names should not contain characters that could cause injection
    if (tag.includes('"') || tag.includes("\\")) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid characters in tag name: ${tag}`,
        "Tag names cannot contain quotes or backslashes"
      );
    }
  }

  return null;
}

/**
 * Validate a project name.
 * Returns null if valid (or empty), or a CliError if invalid.
 */
export function validateProjectName(name: string | undefined): CliError | null {
  if (!name || name.trim() === "") {
    return null;
  }

  // Project names should not contain characters that could cause injection
  if (name.includes('"') || name.includes("\\")) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid characters in project name: ${name}`,
      "Project names cannot contain quotes or backslashes"
    );
  }

  return null;
}

/**
 * Validate a folder name.
 * Returns null if valid (or empty), or a CliError if invalid.
 */
export function validateFolderName(name: string | undefined): CliError | null {
  if (!name || name.trim() === "") {
    return null;
  }

  // Folder names should not contain characters that could cause injection
  if (name.includes('"') || name.includes("\\")) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid characters in folder name: ${name}`,
      "Folder names cannot contain quotes or backslashes"
    );
  }

  return null;
}

/**
 * Validate a tag name for creation/update.
 * Returns null if valid, or a CliError if invalid.
 */
export function validateTagName(name: string): CliError | null {
  if (!name || name.trim() === "") {
    return createError(ErrorCode.VALIDATION_ERROR, "Tag name cannot be empty");
  }

  // Tag names should not contain characters that could cause injection
  if (name.includes('"') || name.includes("\\")) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid characters in tag name: ${name}`,
      "Tag names cannot contain quotes or backslashes"
    );
  }

  return null;
}

/**
 * Validate a repetition rule.
 * Returns null if valid (or undefined), or a CliError if invalid.
 */
export function validateRepetitionRule(
  rule:
    | {
        frequency: string;
        interval: number;
        repeatMethod: string;
        daysOfWeek?: number[] | undefined;
        dayOfMonth?: number | undefined;
      }
    | undefined
): CliError | null {
  if (!rule) {
    return null;
  }

  const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
  if (!validFrequencies.includes(rule.frequency)) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid repetition frequency: ${rule.frequency}`,
      "Valid frequencies are: daily, weekly, monthly, yearly"
    );
  }

  if (rule.interval < 1 || !Number.isInteger(rule.interval)) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid repetition interval: ${String(rule.interval)}`,
      "Interval must be a positive integer"
    );
  }

  const validMethods = ["due-again", "defer-another"];
  if (!validMethods.includes(rule.repeatMethod)) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid repeat method: ${rule.repeatMethod}`,
      "Valid methods are: due-again, defer-another"
    );
  }

  if (rule.daysOfWeek !== undefined) {
    if (!Array.isArray(rule.daysOfWeek) || rule.daysOfWeek.length === 0) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        "daysOfWeek must be a non-empty array"
      );
    }
    for (const day of rule.daysOfWeek) {
      if (day < 0 || day > 6 || !Number.isInteger(day)) {
        return createError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid day of week: ${String(day)}`,
          "Days of week must be integers 0-6 (Sunday=0, Saturday=6)"
        );
      }
    }
  }

  if (rule.dayOfMonth !== undefined) {
    if (
      rule.dayOfMonth < 1 ||
      rule.dayOfMonth > 31 ||
      !Number.isInteger(rule.dayOfMonth)
    ) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid day of month: ${String(rule.dayOfMonth)}`,
        "Day of month must be an integer 1-31"
      );
    }
  }

  return null;
}

/**
 * Validate an estimated minutes value.
 * Returns null if valid (or undefined), or a CliError if invalid.
 */
export function validateEstimatedMinutes(
  minutes: number | undefined
): CliError | null {
  if (minutes === undefined) {
    return null;
  }

  if (!Number.isInteger(minutes) || minutes < 0) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid estimated minutes: ${String(minutes)}`,
      "Estimated minutes must be a non-negative integer"
    );
  }

  return null;
}

/**
 * Validate a search query.
 * Returns null if valid, or a CliError if invalid.
 */
export function validateSearchQuery(query: string): CliError | null {
  if (!query || query.trim() === "") {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      "Search query cannot be empty"
    );
  }

  // Search queries should not contain characters that could cause injection
  if (query.includes('"') || query.includes("\\")) {
    return createError(
      ErrorCode.VALIDATION_ERROR,
      "Invalid characters in search query",
      "Search queries cannot contain quotes or backslashes"
    );
  }

  return null;
}

/**
 * Maximum allowed limit for pagination queries.
 * Set high enough for legitimate use cases but low enough to prevent abuse.
 */
export const MAX_PAGINATION_LIMIT = 10000;

/**
 * Validate pagination parameters (limit and offset).
 * Returns null if valid, or a CliError if invalid.
 */
export function validatePaginationParams(
  limit: number | undefined,
  offset: number | undefined
): CliError | null {
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid limit: ${String(limit)}`,
        "Limit must be a positive integer"
      );
    }
    if (limit > MAX_PAGINATION_LIMIT) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Limit exceeds maximum allowed value: ${String(limit)}`,
        `Maximum limit is ${String(MAX_PAGINATION_LIMIT)}`
      );
    }
  }

  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) {
      return createError(
        ErrorCode.VALIDATION_ERROR,
        `Invalid offset: ${String(offset)}`,
        "Offset must be a non-negative integer"
      );
    }
  }

  return null;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
