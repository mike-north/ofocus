import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Whether the current module is being executed directly as a script (a `bin`
 * entry), as opposed to being imported as a library.
 *
 * Pass the entry module's `import.meta.url`. Global bins are installed as a
 * **symlink** (`.../bin/foo -> .../node_modules/foo/dist/index.js`), so
 * `process.argv[1]` is the symlink path while `import.meta.url` is the resolved
 * real path. A naive comparison of the two never matches through a symlink, so
 * the entry would silently do nothing. This resolves symlinks
 * (`realpathSync`, falling back to `resolve` if that throws) before comparing,
 * so the check is correct whether the bin is invoked directly or via a symlink.
 *
 * @param importMetaUrl - The entry module's `import.meta.url`.
 * @returns `true` when invoked as the main script (including through a symlinked bin).
 *
 * @public
 */
export function isMainModule(importMetaUrl: string): boolean {
  const scriptPath = process.argv[1];
  if (scriptPath === undefined) return false;
  let realScriptPath: string;
  try {
    realScriptPath = realpathSync(scriptPath);
  } catch {
    realScriptPath = resolve(scriptPath);
  }
  return pathToFileURL(realScriptPath).href === importMetaUrl;
}
