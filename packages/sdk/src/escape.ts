/**
 * Escape a string for safe use in AppleScript double-quoted strings.
 * Handles backslashes and double quotes.
 */
export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
