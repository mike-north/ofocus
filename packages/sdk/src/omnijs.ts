import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  type CliError,
  ErrorCode,
  createError,
  parseAppleScriptError,
} from "./errors.js";

const execAsync = promisify(exec);

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
    const command = `osascript -e 'tell application "OmniFocus" to evaluate javascript "${escapedScript}"'`;

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB for large query results
    });

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

    // Try to parse as JSON first
    try {
      const data = JSON.parse(trimmed) as T;
      return { success: true, data };
    } catch {
      // Return raw string if not JSON
      return { success: true, data: trimmed as T };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: parseOmniJSError(message) };
  }
}

/**
 * Escape a JavaScript string for embedding inside an AppleScript
 * double-quoted string passed to `evaluate javascript`.
 *
 * The escaping layers are:
 * 1. The JS code lives inside an AppleScript string literal (double-quoted)
 * 2. That AppleScript lives inside a shell single-quoted argument
 *
 * We need to escape: backslashes, double quotes, and newlines for the
 * AppleScript string layer. The shell single-quote layer is handled by
 * the outer quoting in the command string.
 */
function escapeJSForAppleScript(js: string): string {
  return js
    .replace(/\\/g, "\\\\\\\\") // \ → \\\\ (JS backslash in AS string)
    .replace(/"/g, '\\"') // " → \" (escape for AS string)
    .replace(/\n/g, "\\n") // newline → \n literal in AS string
    .replace(/\r/g, "\\r") // carriage return → \r
    .replace(/\t/g, "\\t"); // tab → \t
}

/**
 * Parse an OmniJS error message into a structured CliError.
 * Reuses AppleScript error parsing since errors come through the same osascript channel.
 */
function parseOmniJSError(rawError: string): CliError {
  // Check for OmniJS-specific errors first
  const errorLower = rawError.toLowerCase();

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

  // Fall back to the existing AppleScript error parser
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
    (result.data as { __omnijs_error: boolean }).__omnijs_error === true
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
 * @param dateStr - Date string in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
 * @returns JavaScript expression that creates a Date object
 */
export function toOmniJSDate(dateStr: string): string {
  // If already ISO format, use directly with Date constructor
  const isoDatePattern =
    /^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2}):?(\d{2})?)?/;
  const match = isoDatePattern.exec(dateStr);

  if (match) {
    const year = match[1] ?? "2026";
    const month = String(parseInt(match[2] ?? "1", 10) - 1); // JS months are 0-indexed
    const day = String(parseInt(match[3] ?? "1", 10));
    const hours = String(parseInt(match[5] ?? "0", 10));
    const minutes = String(parseInt(match[6] ?? "0", 10));
    const seconds = String(parseInt(match[7] ?? "0", 10));

    return `new Date(${year}, ${month}, ${day}, ${hours}, ${minutes}, ${seconds})`;
  }

  // For other formats, let JS parse it
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
