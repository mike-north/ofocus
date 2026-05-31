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

/** Total item count across a summary. */
function totalCount(summary) {
  return (summary?.added ?? 0) + (summary?.updated ?? 0) + (summary?.removed ?? 0);
}

/**
 * One-line nudge for PreToolUse. Empty string ⇒ do not inject.
 * @param {{added:number,updated:number,removed:number}} summary
 */
export function formatNudge(summary) {
  const n = totalCount(summary);
  if (n === 0) return "";
  return (
    `📥 OmniFocus changed (${n} item${n === 1 ? "" : "s"}) since you last reviewed. ` +
    `If you don't already have a task to review the OmniFocus inbox/changes, add one to your task list.`
  );
}

/**
 * Multi-line SessionStart digest. Empty string ⇒ nothing to show.
 * @param {{summary:object, changes:{added:any[],updated:any[],removed:any[]}}} payload
 */
export function formatDigest(payload) {
  const s = payload?.summary ?? { added: 0, updated: 0, removed: 0 };
  if (totalCount(s) === 0) return "";
  const parts = [];
  if (s.added) parts.push(`${s.added} added`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.removed) parts.push(`${s.removed} removed`);
  const names = [
    ...(payload.changes?.added ?? []),
    ...(payload.changes?.updated ?? []),
  ]
    .map((c) => c?.object?.name)
    .filter((n) => typeof n === "string")
    .slice(0, 5);
  const detail = names.length > 0 ? ` — e.g. ${names.join(", ")}` : "";
  return `OmniFocus changes since the last refresh: ${parts.join(", ")}${detail}.`;
}
