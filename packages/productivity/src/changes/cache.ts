import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ChangeSet, Fingerprint, Snapshot, WatchedClass } from "./types.js";

/** On-disk watch cache (spec §5). */
export interface CacheFile {
  version: 1;
  name: string;
  scope: Record<string, unknown>;
  classes: WatchedClass[];
  fingerprint: Fingerprint;
  snapshot: Snapshot;
  generation: number;
  deliveredGeneration: number;
  pending: ChangeSet;
  semanticByGeneration: Record<string, string>;
  refreshLock: { pid: number; startedAt: string } | null;
  updatedAt: string;
}

/** Resolve the state directory: explicit arg > OFOCUS_STATE_DIR > ~/.ofocus. */
export function resolveStateDir(stateDir?: string): string {
  if (stateDir !== undefined && stateDir.length > 0) return stateDir;
  const env = process.env["OFOCUS_STATE_DIR"];
  if (env !== undefined && env.length > 0) return env;
  return join(homedir(), ".ofocus");
}

/** Resolve the cache file path for a named watch. */
export function resolveCachePath(name: string, stateDir?: string): string {
  return join(resolveStateDir(stateDir), "watch", `${name}.json`);
}

/** Atomically write a cache file (temp + rename), creating parent dirs. */
export function writeCache(path: string, cache: CacheFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${String(process.pid)}`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  renameSync(tmp, path);
}

/**
 * Read a cache file. Returns null if absent. On a corrupt file, moves it aside
 * to `<name>.corrupt-<suffix>.json` and returns null (spec §9).
 */
export function readCache(path: string): CacheFile | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as CacheFile;
  } catch {
    const suffix = safeCorruptSuffix(path);
    try {
      renameSync(path, path.replace(/\.json$/, `.corrupt-${suffix}.json`));
    } catch {
      /* best-effort backup */
    }
    return null;
  }
}

/** Deterministic suffix derived from the file's own mtime (not wall clock). */
function safeCorruptSuffix(path: string): string {
  try {
    return String(statSync(path).mtimeMs).replace(/\W/g, "");
  } catch {
    return "backup";
  }
}
