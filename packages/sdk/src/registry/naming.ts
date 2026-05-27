/**
 * Naming-convention helpers for the centralized command registry.
 *
 * Every command has a single canonical `name` (camelCase, matching the SDK
 * function name). Display names for the CLI (kebab-case, e.g. `create-project`)
 * and MCP (snake_case, e.g. `create_project`) are derived from it
 * mechanically so the three surfaces never drift.
 */

/**
 * Convert a camelCase identifier to kebab-case.
 *
 * @example
 * ```ts
 * toKebabCase("createProject") // "create-project"
 * toKebabCase("addToInbox")    // "add-to-inbox"
 * toKebabCase("inbox")         // "inbox"
 * ```
 */
export function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (match, offset: number) =>
    offset === 0 ? match.toLowerCase() : `-${match.toLowerCase()}`
  );
}

/**
 * Convert a camelCase identifier to snake_case.
 *
 * @example
 * ```ts
 * toSnakeCase("createProject") // "create_project"
 * toSnakeCase("addToInbox")    // "add_to_inbox"
 * toSnakeCase("inbox")         // "inbox"
 * ```
 */
export function toSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (match, offset: number) =>
    offset === 0 ? match.toLowerCase() : `_${match.toLowerCase()}`
  );
}

/**
 * Validate that a name is a non-empty camelCase identifier suitable for
 * derivation into kebab-case and snake_case display names.
 *
 * Returns `null` if valid, or an error message describing the violation.
 */
export function validateCanonicalName(name: string): string | null {
  if (name.length === 0) {
    return "Command name cannot be empty";
  }
  if (!/^[a-z]/.test(name)) {
    return `Command name must start with a lowercase letter: ${name}`;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
    return `Command name must be camelCase (letters and digits only): ${name}`;
  }
  return null;
}
