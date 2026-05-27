/**
 * Generate a safe JavaScript variable name for a tag reference.
 *
 * Uses index-based naming to prevent collisions when tag names differ
 * only in special characters (e.g., "work/home" and "work-home" would
 * both sanitize to "work_home" with content-based naming).
 *
 * @param _str - The tag name (unused, kept for documentation context)
 * @param index - The loop index for unique naming
 * @returns A safe variable name like `tag_0`, `tag_1`, etc.
 */
export function sanitizeVarName(_str: string, index: number): string {
  return `tag_${String(index)}`;
}
