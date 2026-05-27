import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type CliError,
  ErrorCode,
  createError,
  parseAppleScriptError,
} from "./errors.js";

const execFileAsync = promisify(execFile);

/**
 * Result of executing an OmniJS script via OmniFocus's evaluate javascript.
 *
 * @typeParam T - The expected type of the parsed result data
 *
 * @public
 */
export interface OmniJSResult<T> {
  /** Indicates whether the script executed successfully */
  success: boolean;
  /** The parsed result data if successful */
  data?: T;
  /** Error details if the script failed */
  error?: CliError;
}

/**
 * Execute an OmniJS (JavaScript) script within OmniFocus via osascript.
 *
 * The script is evaluated using:
 *   osascript -e 'tell application "OmniFocus" to evaluate javascript "..."'
 *
 * The script should end with a JSON.stringify(...) expression so the result
 * can be parsed back into a typed value.
 */
export async function runOmniJS<T>(script: string): Promise<OmniJSResult<T>> {
  try {
    const escapedScript = escapeJSForAppleScript(script);
    const asScript = `tell application "OmniFocus" to evaluate javascript "${escapedScript}"`;

    const { stdout, stderr } = await execFileAsync(
      "osascript",
      ["-e", asScript],
      {
        maxBuffer: 10 * 1024 * 1024, // 10MB for large query results
        timeout: 30_000,
      }
    );

    if (stderr) {
      return { success: false, error: parseOmniJSError(stderr.trim()) };
    }

    const trimmed = stdout.trim();

    // Fail explicitly on empty responses
    if (trimmed === "") {
      return {
        success: false,
        error: createError(
          ErrorCode.APPLESCRIPT_ERROR,
          "OmniJS returned empty response"
        ),
      };
    }

    // Parse as JSON — non-JSON output is a protocol violation
    try {
      const data = JSON.parse(trimmed) as T;
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: createError(
          ErrorCode.APPLESCRIPT_ERROR,
          `Unexpected non-JSON output: ${trimmed.slice(0, 200)}`
        ),
      };
    }
  } catch (err) {
    // Handle timeout (execFile sets killed=true when timeout exceeded)
    if (
      err instanceof Error &&
      "killed" in err &&
      (err as NodeJS.ErrnoException & { killed?: boolean }).killed
    ) {
      return {
        success: false,
        error: createError(
          ErrorCode.APPLESCRIPT_ERROR,
          "OmniJS script timed out after 30 seconds"
        ),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: parseOmniJSError(message) };
  }
}

/**
 * Escape a JavaScript string for embedding inside an AppleScript
 * double-quoted string passed to `evaluate javascript`.
 *
 * With execFile (no shell layer), escaping layers are:
 * 1. AppleScript double-quoted string: \\ → \, \" → "
 * 2. JavaScript eval: interprets the resulting string as JS source
 *
 * We escape: backslashes, double quotes, newlines, tabs, carriage returns.
 */
export function escapeJSForAppleScript(js: string): string {
  return js
    .replace(/\\/g, "\\\\") // \ → \\ (for AppleScript string layer)
    .replace(/"/g, '\\"') // " → \" (escape for AS string)
    .replace(/\n/g, "\\n") // newline → \n literal in AS string
    .replace(/\r/g, "\\r") // carriage return → \r
    .replace(/\t/g, "\\t"); // tab → \t
}

/**
 * Parse an OmniJS error message into a structured CliError.
 *
 * Maps OmniJS-thrown error patterns (e.g. `throw new Error("Task not found: <id>")`)
 * to semantic error codes before falling back to AppleScript error parsing.
 */
function parseOmniJSError(rawError: string): CliError {
  const errorLower = rawError.toLowerCase();

  // OmniJS script/runtime errors (TypeError, undefined symbol, etc.)
  if (
    errorLower.includes("error: typeerror") ||
    errorLower.includes("is not a function") ||
    errorLower.includes("is undefined") ||
    errorLower.includes("is not defined")
  ) {
    return createError(
      ErrorCode.APPLESCRIPT_ERROR,
      "OmniJS script error",
      rawError
    );
  }

  // OmniJS commands throw `Error("Task not found: <id>")` (and the
  // "Parent task not found: <id>" variant). Map these to TASK_NOT_FOUND.
  if (errorLower.includes("task not found")) {
    return createError(ErrorCode.TASK_NOT_FOUND, "Task not found", rawError);
  }

  // OmniJS commands throw `Error("Project not found: <name>")`.
  if (errorLower.includes("project not found")) {
    return createError(
      ErrorCode.PROJECT_NOT_FOUND,
      "Project not found",
      rawError
    );
  }

  // OmniJS commands throw `Error("Tag not found: <name>")`.
  if (errorLower.includes("tag not found")) {
    return createError(ErrorCode.TAG_NOT_FOUND, "Tag not found", rawError);
  }

  // OmniJS commands throw `Error("Folder not found: <id|name>")`.
  if (errorLower.includes("folder not found")) {
    return createError(
      ErrorCode.FOLDER_NOT_FOUND,
      "Folder not found",
      rawError
    );
  }

  // Fall back to the existing AppleScript error parser for messages that
  // surface through the same osascript channel (e.g. OmniFocus not running).
  return parseAppleScriptError(rawError);
}

/**
 * Build an OmniJS script that wraps the body in a try/catch
 * and returns JSON-encoded results or error information.
 *
 * @param body - The JavaScript code to execute within OmniFocus
 * @returns Complete JavaScript string ready for execution via evaluate javascript
 *
 * @public
 */
export function wrapOmniJS(body: string): string {
  return `(function() {
  try {
    ${body}
  } catch (err) {
    return JSON.stringify({ __omnijs_error: true, message: String(err) });
  }
})()`;
}

/**
 * Execute an OmniJS script with automatic try/catch wrapping and error detection.
 *
 * The body should end with a `return JSON.stringify(...)` statement.
 * Errors thrown within the script are caught and returned as structured errors.
 */
export async function runOmniJSWrapped<T>(
  body: string
): Promise<OmniJSResult<T>> {
  const script = wrapOmniJS(body);
  const result = await runOmniJS<
    T | { __omnijs_error: boolean; message: string }
  >(script);

  if (!result.success) {
    return result as OmniJSResult<T>;
  }

  // Check for caught errors
  if (
    result.data !== null &&
    result.data !== undefined &&
    typeof result.data === "object" &&
    "__omnijs_error" in result.data &&
    (result.data as { __omnijs_error: boolean }).__omnijs_error
  ) {
    const errData = result.data as { __omnijs_error: boolean; message: string };
    return {
      success: false,
      error: parseOmniJSError(errData.message),
    };
  }

  return result as OmniJSResult<T>;
}

/**
 * Convert a Date string (ISO format or similar) to a JavaScript Date constructor call
 * suitable for use in OmniJS scripts.
 *
 * Local-time strings (no timezone designator) are emitted as a 6-argument
 * `new Date(year, monthIndex, day, hours, minutes, seconds)` call so they are
 * interpreted in OmniFocus's local timezone. Strings carrying a timezone
 * designator (`Z` or `±HH:MM`) are passed through to `new Date("<str>")` so the
 * JS parser preserves the original timezone semantics. Any other format also
 * falls through to the string constructor.
 *
 * @param dateStr - Date string in ISO format (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]`),
 *                  optionally with a `Z`/`±HH:MM` suffix, or any other Date-parseable string.
 * @returns JavaScript expression that creates a Date object
 */
export function toOmniJSDate(dateStr: string): string {
  // Strict local-time ISO pattern: anchored end-of-string with no timezone suffix.
  // Strings like `2024-06-15T14:30:00Z` or `2024-06-15T14:30:00+05:00` will NOT match
  // and will fall through to the string-constructor branch, which preserves their
  // intended UTC/offset semantics instead of silently reinterpreting them as local time.
  const isoLocalPattern =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const match = isoLocalPattern.exec(dateStr);

  if (match) {
    const year = match[1] ?? "2026";
    const month = String(parseInt(match[2] ?? "1", 10) - 1); // JS months are 0-indexed
    const day = String(parseInt(match[3] ?? "1", 10));
    const hours = String(parseInt(match[4] ?? "0", 10));
    const minutes = String(parseInt(match[5] ?? "0", 10));
    const seconds = String(parseInt(match[6] ?? "0", 10));

    return `new Date(${year}, ${month}, ${day}, ${hours}, ${minutes}, ${seconds})`;
  }

  // For ISO strings with timezone designators (Z or ±HH:MM) or any other format,
  // let JS's Date parser handle it so timezone semantics are preserved.
  return `new Date("${escapeJSString(dateStr)}")`;
}

/**
 * Escape a string for safe embedding in a JavaScript string literal.
 */
export function escapeJSString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
