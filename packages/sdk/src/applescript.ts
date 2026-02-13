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
 * Result of executing an AppleScript.
 *
 * @typeParam T - The expected type of the parsed result data
 *
 * @public
 */
export interface AppleScriptResult<T> {
  /** Indicates whether the script executed successfully */
  success: boolean;
  /** The parsed result data if successful */
  data?: T;
  /** Error details if the script failed */
  error?: CliError;
}

/**
 * Execute an AppleScript and return the result.
 * The script should return a value that can be parsed as JSON for structured data.
 */
export async function runAppleScript<T>(
  script: string
): Promise<AppleScriptResult<T>> {
  try {
    const { stdout, stderr } = await execAsync(
      `osascript -e '${escapeForShell(script)}'`
    );

    if (stderr) {
      return { success: false, error: parseAppleScriptError(stderr.trim()) };
    }

    const trimmed = stdout.trim();

    // Fail explicitly on empty responses
    if (trimmed === "") {
      return {
        success: false,
        error: createError(
          ErrorCode.APPLESCRIPT_ERROR,
          "AppleScript returned empty response"
        ),
      };
    }

    // Try to parse as JSON first
    try {
      const data = JSON.parse(trimmed) as T;
      return { success: true, data };
    } catch {
      // Return raw string if not JSON - but only if T could reasonably be a string
      // This is still a type assertion, but it's a safer fallback
      return { success: true, data: trimmed as T };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: parseAppleScriptError(message) };
  }
}

/**
 * Execute an AppleScript file.
 */
export async function runAppleScriptFile<T>(
  filePath: string,
  args: string[] = []
): Promise<AppleScriptResult<T>> {
  try {
    const argsStr = args.map((a) => `"${escapeForShell(a)}"`).join(" ");
    const { stdout, stderr } = await execAsync(
      `osascript "${filePath}" ${argsStr}`
    );

    if (stderr) {
      return { success: false, error: parseAppleScriptError(stderr.trim()) };
    }

    const trimmed = stdout.trim();

    // Fail explicitly on empty responses
    if (trimmed === "") {
      return {
        success: false,
        error: createError(
          ErrorCode.APPLESCRIPT_ERROR,
          "AppleScript returned empty response"
        ),
      };
    }

    try {
      const data = JSON.parse(trimmed) as T;
      return { success: true, data };
    } catch {
      return { success: true, data: trimmed as T };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: parseAppleScriptError(message) };
  }
}

/**
 * Escape a string for use in a shell command.
 */
function escapeForShell(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Build an AppleScript that tells OmniFocus to do something.
 */
export function omniFocusScript(body: string): string {
  return `tell application "OmniFocus"
  tell default document
    ${body}
  end tell
end tell`;
}

/**
 * AppleScript helper functions for JSON serialization.
 * These must be defined at the top level (outside tell blocks).
 */
export const jsonHelpers = `
on jsonString(val)
  if val is "" or val is missing value or val is "missing value" then
    return "null"
  else
    return "\\"" & my escapeJson(val) & "\\""
  end if
end jsonString

on jsonArray(theList)
  if (count of theList) is 0 then
    return "[]"
  end if
  set output to "["
  repeat with i from 1 to count of theList
    if i > 1 then set output to output & ","
    set output to output & "\\"" & (my escapeJson(item i of theList)) & "\\""
  end repeat
  return output & "]"
end jsonArray

on escapeJson(str)
  set output to ""
  set quoteChar to "\\""
  set bslashChar to "\\\\"
  set tabChar to tab
  repeat with c in characters of (str as string)
    set ch to c as string
    if ch is quoteChar then
      set output to output & "\\\\\\""
    else if ch is bslashChar then
      set output to output & "\\\\\\\\"
    else if ch is return then
      set output to output & "\\\\n"
    else if ch is linefeed then
      set output to output & "\\\\n"
    else if ch is tabChar then
      set output to output & "\\\\t"
    else
      -- Check for other control characters (ASCII 0-31) and skip them
      set charCode to id of ch
      if charCode < 32 then
        -- Skip control characters
      else
        set output to output & ch
      end if
    end if
  end repeat
  return output
end escapeJson
`;

/**
 * Build an AppleScript that tells OmniFocus to do something,
 * with JSON helper functions defined at the top level.
 */
export function omniFocusScriptWithHelpers(body: string): string {
  return `${jsonHelpers}

tell application "OmniFocus"
  tell default document
    ${body}
  end tell
end tell`;
}

/**
 * Compose multiple script parts and wrap in OmniFocus tell block.
 * Handlers (on...end) go at the top level, body goes in the tell block.
 *
 * @param handlers - Array of handler code (on...end blocks)
 * @param body - The main script body to execute within the tell block
 * @returns Complete AppleScript string ready for execution
 *
 * @example
 * ```typescript
 * const jsonHelpers = await loadScriptContent("helpers/json.applescript");
 * const script = composeScript([jsonHelpers], 'return my jsonString("test")');
 * ```
 *
 * @public
 */
export function composeScript(handlers: string[], body: string): string {
  const handlersCode = handlers.join("\n\n");
  return `${handlersCode}

tell application "OmniFocus"
  tell default document
    ${body}
  end tell
end tell`;
}

/**
 * Execute a composed AppleScript with handlers and body.
 * Composes the script using {@link composeScript} and executes it.
 *
 * @param handlers - Array of handler code (on...end blocks)
 * @param body - The main script body to execute within the tell block
 * @returns Result object with success status and parsed data or error
 *
 * @example
 * ```typescript
 * const jsonHelpers = await loadScriptContentCached("helpers/json.applescript");
 * const taskSerializer = await loadScriptContentCached("serializers/task.applescript");
 *
 * const result = await runComposedScript<OFTask>(
 *   [jsonHelpers, taskSerializer],
 *   'return my serializeTask(first task of inbox tasks)'
 * );
 * ```
 *
 * @public
 */
export async function runComposedScript<T>(
  handlers: string[],
  body: string
): Promise<AppleScriptResult<T>> {
  const script = composeScript(handlers, body);
  return runAppleScript<T>(script);
}
