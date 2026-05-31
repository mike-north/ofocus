import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the OmniFocus 4 `.ofocus` database package path, or null if it
 * cannot be located/read (e.g. macOS TCC without Full Disk Access). Spec §4.4.
 */
export function resolveDbPackagePath(): string | null {
  const base = join(
    homedir(),
    "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/OmniFocus",
  );
  try {
    if (!existsSync(base)) return null;
    const pkg = readdirSync(base).find((f) => f.endsWith(".ofocus"));
    return pkg !== undefined ? join(base, pkg) : null;
  } catch {
    return null; // unreadable → no FDA
  }
}

/** Read the package directory mtime as an ISO string, or null if unreadable. */
export function readDbMtime(packagePath: string): string | null {
  try {
    return statSync(packagePath).mtime.toISOString();
  } catch {
    return null;
  }
}
