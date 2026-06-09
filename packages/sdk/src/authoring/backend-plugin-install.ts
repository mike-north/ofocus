import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliOutput } from "../types.js";
import { success, failure } from "../result.js";
import { ErrorCode, createError } from "../errors.js";
import {
  compileActionToPlugin,
  type OmniActionMetadata,
} from "./plugin-emit.js";
import { resolvePluginsDir } from "./plugins-dir.js";
import type { OmniAction } from "./types.js";

/** @public */
export interface InstallResult {
  /** Absolute path the plugin was written to. */
  path: string;
}

/**
 * Compile an {@link OmniAction} and install it by writing a single-file
 * `.omnijs` into the OmniFocus Plug-Ins folder. OmniFocus live-loads it; no
 * approval sheet (verified 2026-06-08). Note: uninstall requires an OmniFocus
 * relaunch — deleting the file does not live-unload it.
 *
 * @public
 */
export async function installOmniAction(
  action: OmniAction,
  meta: OmniActionMetadata,
  opts: { home?: string; fileName?: string } = {}
): Promise<CliOutput<InstallResult>> {
  const dir = resolvePluginsDir({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
  });
  const fileName = opts.fileName ?? `${meta.identifier}.omnijs`;
  const path = join(dir, fileName);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, compileActionToPlugin(action, meta), "utf8");
    return success({ path });
  } catch (err) {
    return failure(
      createError(
        ErrorCode.UNKNOWN_ERROR,
        err instanceof Error ? err.message : "Failed to install plugin"
      )
    );
  }
}
