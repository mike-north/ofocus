import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Get the absolute path to a script file.
 *
 * @param relativePath - Path relative to the scripts directory (e.g., "helpers/json.applescript")
 * @returns Absolute path to the script file
 * @throws If the path attempts to traverse outside the scripts directory
 *
 * @example
 * ```typescript
 * const path = getScriptPath("helpers/json.applescript");
 * // Returns: "/path/to/dist/scripts/helpers/json.applescript"
 * ```
 *
 * @public
 */
export function getScriptPath(relativePath: string): string {
  const scriptsDir = join(__dirname, "scripts");
  const scriptPath = join(scriptsDir, relativePath);

  // Security: Prevent path traversal outside the scripts directory
  if (!scriptPath.startsWith(scriptsDir)) {
    throw new Error(`Invalid script path: ${relativePath}`);
  }

  return scriptPath;
}

/**
 * Load the content of a script file.
 *
 * @param relativePath - Path relative to the scripts directory (e.g., "helpers/json.applescript")
 * @returns The script content as a string
 * @throws If the file does not exist or cannot be read
 *
 * @example
 * ```typescript
 * const jsonHelpers = await loadScriptContent("helpers/json.applescript");
 * ```
 *
 * @public
 */
export async function loadScriptContent(relativePath: string): Promise<string> {
  const scriptPath = getScriptPath(relativePath);
  return readFile(scriptPath, "utf-8");
}

/**
 * Cache for loaded script content to avoid repeated file reads.
 */
const scriptCache = new Map<string, string>();

/**
 * Load the content of a script file, with caching.
 * Subsequent calls with the same path return cached content.
 *
 * @param relativePath - Path relative to the scripts directory (e.g., "helpers/json.applescript")
 * @returns The script content as a string
 * @throws If the file does not exist or cannot be read (on first load)
 *
 * @example
 * ```typescript
 * // First call reads from disk
 * const helpers1 = await loadScriptContentCached("helpers/json.applescript");
 * // Second call returns cached content
 * const helpers2 = await loadScriptContentCached("helpers/json.applescript");
 * ```
 *
 * @public
 */
export async function loadScriptContentCached(
  relativePath: string
): Promise<string> {
  const cached = scriptCache.get(relativePath);
  if (cached !== undefined) {
    return cached;
  }
  const content = await loadScriptContent(relativePath);
  scriptCache.set(relativePath, content);
  return content;
}

/**
 * Clear the script cache.
 * Useful for testing or when scripts may have been modified.
 *
 * @public
 */
export function clearScriptCache(): void {
  scriptCache.clear();
}
