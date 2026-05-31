// Pure, dependency-free helpers for the ofocus-assistant hook.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir, tmpdir as _tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const PLUGIN_NAME = "ofocus-assistant";

/**
 * Derive a stable per-session key from a hook stdin payload, via a fallback
 * chain so it never depends on one field. Never agent-generated.
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function sessionKey(payload) {
  const sid = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (sid.length > 0) return sid;
  const tp = typeof payload.transcript_path === "string" ? payload.transcript_path.trim() : "";
  if (tp.length > 0) return tp;
  return "_shared";
}

/**
 * Decide whether to nudge THIS session (generation-gated per session).
 * @param {{cursor: number, generation: number, pendingNonEmpty: boolean}} args
 */
export function shouldNudge({ cursor, generation, pendingNonEmpty }) {
  return pendingNonEmpty && generation > cursor;
}

/**
 * Decide whether to trigger a (shared) background refresh.
 * @param {string|null} lastRefreshAt ISO timestamp or null
 * @param {number} nowMs
 * @param {number} intervalMs
 */
export function shouldRefresh(lastRefreshAt, nowMs, intervalMs) {
  if (!lastRefreshAt) return true;
  const last = Date.parse(lastRefreshAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last > intervalMs;
}
