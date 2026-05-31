import { spawn } from "node:child_process";
import type { CacheFile } from "./cache.js";

/**
 * Decide whether to spawn a background refresh.
 * Single-flight: a lock held by a LIVE pid blocks spawning.
 * Stale-lock recovery: a lock whose pid is dead is ignored.
 * Debounce: skip if the last completed refresh (cache.updatedAt) is younger than debounceMs.
 *
 * @param cache      current cache
 * @param nowIso     injected current time (ISO 8601)
 * @param debounceMs minimum interval since the last completed refresh
 * @param livePids   pids known to be alive (injected for testability)
 */
export function shouldSpawnRefresh(
  cache: CacheFile,
  nowIso: string,
  debounceMs: number,
  livePids: readonly number[],
): boolean {
  if (cache.refreshLock !== null && livePids.includes(cache.refreshLock.pid)) {
    return false; // single-flight: a live refresh is already running
  }
  const now = Date.parse(nowIso);
  const last = Date.parse(cache.updatedAt);
  if (Number.isFinite(last) && now - last < debounceMs) {
    return false; // debounce
  }
  return true;
}

/** Return true if a pid is alive (signal 0 probe). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn a detached `<ofocusBin> changes --watch <name> --refresh-inline` child
 * that performs the scan + pending accumulation out of band, then exits.
 * `ofocusBin` is the resolved CLI entry path (the caller — e.g. the L3 hook —
 * knows it). The child is fully detached and its IO ignored.
 */
export function spawnBackgroundRefresh(
  ofocusBin: string,
  watch: string,
  stateDir?: string,
): void {
  const env = { ...process.env };
  if (stateDir !== undefined) env["OFOCUS_STATE_DIR"] = stateDir;
  const child = spawn(
    process.execPath,
    [ofocusBin, "changes", "--watch", watch, "--refresh-inline"],
    { detached: true, stdio: "ignore", env },
  );
  child.unref();
}
