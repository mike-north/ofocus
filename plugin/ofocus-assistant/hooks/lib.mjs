// Pure, dependency-free helpers for the ofocus-assistant hook.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

// ---------------------------------------------------------------------------
// Per-session hook state (persistent JSON, atomic write, GC)
// ---------------------------------------------------------------------------

const SESSION_GC_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Read the hook state file; {} if absent/unreadable/corrupt (fail-open). */
export function readState(path) {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/** Atomically write the hook state file (temp + rename), creating parent dirs. */
export function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${String(process.pid)}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, path);
}

function ensureWatch(state, watch) {
  const next = { ...state };
  const existing = next[watch] ?? { lastRefreshAt: null, sessions: {} };
  next[watch] = { ...existing, sessions: { ...existing.sessions } };
  return next;
}

/** Cursor (lastNudgedGeneration) for a session; -1 if unknown. */
export function getCursor(state, watch, key) {
  const c = state?.[watch]?.sessions?.[key]?.lastNudgedGeneration;
  return typeof c === "number" ? c : -1;
}

/** Record a nudge for a session (cursor + lastSeenAt). Returns new state. */
export function recordNudge(state, watch, key, generation, nowIso) {
  const next = ensureWatch(state, watch);
  next[watch].sessions[key] = { lastNudgedGeneration: generation, lastSeenAt: nowIso };
  return next;
}

/** Set the per-watch shared lastRefreshAt. Returns new state. */
export function setLastRefresh(state, watch, nowIso) {
  const next = ensureWatch(state, watch);
  next[watch].lastRefreshAt = nowIso;
  return next;
}

/** Prune session entries whose lastSeenAt is older than the window. */
export function pruneSessions(state, nowMs, windowMs = SESSION_GC_WINDOW_MS) {
  const next = { ...state };
  for (const watch of Object.keys(next)) {
    const sessions = next[watch]?.sessions ?? {};
    const kept = {};
    for (const [key, entry] of Object.entries(sessions)) {
      const seen = Date.parse(entry?.lastSeenAt ?? "");
      if (!Number.isFinite(seen) || nowMs - seen <= windowMs) kept[key] = entry;
    }
    next[watch] = { ...next[watch], sessions: kept };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Resolve plugin config from an env-like object (default: process.env).
 * @param {Record<string,string|undefined>} [env]
 */
export function resolveConfig(env = process.env) {
  const watch = (env.OFOCUS_ASSISTANT_WATCH ?? "").trim() || "agent";
  const rawInterval = Number(env.OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS);
  const refreshIntervalMs = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 300000;
  const bin = (env.OFOCUS_BIN ?? "").trim() || "ofocus";
  const disabled = Boolean((env.OFOCUS_ASSISTANT_DISABLE ?? "").trim());
  const stateDir = (env.OFOCUS_STATE_DIR ?? "").trim() || join(homedir(), ".ofocus");
  return { watch, refreshIntervalMs, bin, disabled, stateDir };
}

/** Path to the hook's own state file. */
export function stateFilePath(stateDir) {
  return join(stateDir, "hook-state.json");
}
