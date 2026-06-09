import { homedir } from "node:os";
import { join } from "node:path";

/** Container-relative path to the OmniFocus 4 Plug-Ins folder. */
const OF4_PLUGINS_REL =
  "Library/Containers/com.omnigroup.OmniFocus4/Data/Library/Application Support/Plug-Ins";

/**
 * Resolve the OmniFocus 4 Plug-Ins directory. v1 targets the standard
 * `com.omnigroup.OmniFocus4` container (verified 2026-06-08, build 185.15).
 *
 * @public
 */
export function resolvePluginsDir(opts: { home?: string } = {}): string {
  return join(opts.home ?? homedir(), OF4_PLUGINS_REL);
}
