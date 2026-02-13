/**
 * Escape a string for safe use in AppleScript double-quoted strings.
 * Handles backslashes and double quotes.
 */
export function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Convert a date string to a format AppleScript understands.
 * AppleScript doesn't handle ISO dates like "2024-01-15" well.
 * This converts to "MM/DD/YYYY" or "MM/DD/YYYY HH:MM:SS AM/PM" format.
 */
export function toAppleScriptDate(dateStr: string): string {
  // Check if it's an ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
  const isoDatePattern =
    /^(\d{4})-(\d{2})-(\d{2})(T(\d{2}):(\d{2}):?(\d{2})?)?/;
  const match = isoDatePattern.exec(dateStr);

  if (match) {
    const year = match[1] ?? "";
    const month = match[2] ?? "";
    const day = match[3] ?? "";
    const hours = match[5];
    const minutes = match[6];
    const seconds = match[7];

    // Convert to MM/DD/YYYY format
    let result = `${month}/${day}/${year}`;

    // Add time if present
    if (hours && minutes) {
      const hour = parseInt(hours, 10);
      const period = hour >= 12 ? "PM" : "AM";
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      result += ` ${String(hour12)}:${minutes}`;
      if (seconds) result += `:${seconds}`;
      result += ` ${period}`;
    }

    return result;
  }

  // Return as-is if not ISO format (might already be AppleScript-compatible)
  return dateStr;
}
