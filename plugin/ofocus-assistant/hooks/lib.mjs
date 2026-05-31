// Pure, dependency-free helpers for the ofocus-assistant hook (tiered model).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PLUGIN_NAME = "ofocus-assistant";
const SESSION_GC_WINDOW_MS = 7 * 24 * 3600 * 1000;

// ── session identity ────────────────────────────────────────────────
/**
 * Derive a stable per-session key from a hook stdin payload, via a fallback
 * chain so it never depends on one field. Never agent-generated.
 * @param {Record<string, unknown>} payload
 */
export function sessionKey(payload) {
  const sid = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (sid.length > 0) return sid;
  const tp = typeof payload.transcript_path === "string" ? payload.transcript_path.trim() : "";
  if (tp.length > 0) return tp;
  return "_shared";
}

// ── decisions ───────────────────────────────────────────────────────
/**
 * Whether to SURFACE (bring this session up to date) — used by SessionStart,
 * Stop, and the urgent-PreToolUse precondition. Generation-gated per session.
 * @param {{seenGeneration:number, generation:number, pendingNonEmpty:boolean}} a
 */
export function shouldSurface({ seenGeneration, generation, pendingNonEmpty }) {
  return pendingNonEmpty && generation > seenGeneration;
}

/**
 * Whether to trigger a (shared) background refresh.
 * @param {string|null} lastRefreshAt
 * @param {number} nowMs
 * @param {number} intervalMs
 */
export function shouldRefresh(lastRefreshAt, nowMs, intervalMs) {
  if (!lastRefreshAt) return true;
  const last = Date.parse(lastRefreshAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last > intervalMs;
}

// ── urgency (deterministic; compute-don't-reason) ───────────────────
/** Local end-of-day in ms for an instant. */
export function endOfTodayMs(nowMs) {
  const d = new Date(nowMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Iterate updated deltas; return the first that is urgent, else null. */
function firstUrgent(changesPayload, { dueThresholdMs = null, agentTag = null } = {}) {
  const updated = changesPayload?.changes?.updated ?? [];
  for (const c of updated) {
    const delta = c?.delta ?? {};
    if (delta.flagged && delta.flagged.from !== true && delta.flagged.to === true) {
      return { c, reason: "flagged" };
    }
    if (dueThresholdMs != null && delta.dueDate && typeof delta.dueDate.to === "string") {
      const due = Date.parse(delta.dueDate.to);
      // Urgent only when the due date CROSSES INTO the window (spec §4.3): the new
      // due is at/under the threshold AND the old due was outside it (absent/invalid,
      // or later than the threshold). A task already inside the window that is merely
      // re-dated to another in-window date does not re-fire.
      const fromRaw = delta.dueDate.from;
      const from = typeof fromRaw === "string" ? Date.parse(fromRaw) : NaN;
      const wasOutside = !Number.isFinite(from) || from > dueThresholdMs;
      if (Number.isFinite(due) && due <= dueThresholdMs && wasOutside) {
        return { c, reason: "due" };
      }
    }
    if (agentTag && delta.tags) {
      const from = Array.isArray(delta.tags.from) ? delta.tags.from : [];
      const to = Array.isArray(delta.tags.to) ? delta.tags.to : [];
      if (to.includes(agentTag) && !from.includes(agentTag)) return { c, reason: "tag" };
    }
  }
  return null;
}

/**
 * True if any updated delta is urgent (newly overdue/due-today, newly flagged,
 * or gained the configured agent tag).
 * @param {{changes?:{updated?:any[]}}} changesPayload
 * @param {{dueThresholdMs?:number|null, agentTag?:string|null}} [opts]
 */
export function classifyUrgency(changesPayload, opts = {}) {
  return firstUrgent(changesPayload, opts) !== null;
}

// ── formatting ──────────────────────────────────────────────────────
function totalCount(summary) {
  return (summary?.added ?? 0) + (summary?.updated ?? 0) + (summary?.removed ?? 0);
}

/**
 * One-line soft nudge for PreToolUse. Empty string ⇒ do not inject.
 * @param {{added:number,updated:number,removed:number}} summary
 */
export function formatNudge(summary) {
  const n = totalCount(summary);
  if (n === 0) return "";
  return (
    `📥 OmniFocus changed (${n} item${n === 1 ? "" : "s"}) since you last reviewed. ` +
    `If you don't already have a task to review the OmniFocus inbox/changes, add one to your ` +
    `task list to follow up when you finish your current work.`
  );
}

/**
 * Multi-line SessionStart/Stop digest. Empty string ⇒ nothing to show.
 * @param {{summary:object, changes:{added:any[],updated:any[],removed:any[]}}} payload
 */
export function formatDigest(payload) {
  const s = payload?.summary ?? { added: 0, updated: 0, removed: 0 };
  if (totalCount(s) === 0) return "";
  const parts = [];
  if (s.added) parts.push(`${s.added} added`);
  if (s.updated) parts.push(`${s.updated} updated`);
  if (s.removed) parts.push(`${s.removed} removed`);
  const names = [...(payload.changes?.added ?? []), ...(payload.changes?.updated ?? [])]
    .map((c) => c?.object?.name)
    .filter((n) => typeof n === "string")
    .slice(0, 5);
  const detail = names.length > 0 ? ` — e.g. ${names.join(", ")}` : "";
  return `OmniFocus changes since the last refresh: ${parts.join(", ")}${detail}.`;
}

/**
 * One-line urgent interjection naming the first urgent item. Empty ⇒ none.
 * @param {{changes?:{updated?:any[]}}} changesPayload
 * @param {{dueThresholdMs?:number|null, agentTag?:string|null}} [opts]
 */
export function formatUrgent(changesPayload, opts = {}) {
  const hit = firstUrgent(changesPayload, opts);
  if (!hit) return "";
  const name = hit.c?.object?.name ?? "a task";
  if (hit.reason === "flagged") {
    return `⚠️ OmniFocus: "${name}" was just flagged — handle it now or add a task to follow up.`;
  }
  if (hit.reason === "due") {
    const to = hit.c?.delta?.dueDate?.to ?? "";
    return `⚠️ OmniFocus: "${name}" is now due (${to}) — handle it now or add a task to follow up.`;
  }
  return `⚠️ OmniFocus: "${name}" was routed to you — consider handling it or adding a follow-up task.`;
}

// ── per-session state ───────────────────────────────────────────────
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

function ensureSession(state, watch, key) {
  const next = { ...state };
  const w = next[watch] ?? { lastRefreshAt: null, sessions: {} };
  next[watch] = { ...w, sessions: { ...w.sessions } };
  const existing = next[watch].sessions[key] ?? {
    lastSeenGeneration: -1,
    lastNudgedAt: null,
    lastSeenAt: null,
  };
  next[watch].sessions[key] = { ...existing };
  return next;
}

/** lastSeenGeneration for a session; -1 if unknown. */
export function getSeenGeneration(state, watch, key) {
  const c = state?.[watch]?.sessions?.[key]?.lastSeenGeneration;
  return typeof c === "number" ? c : -1;
}

/** lastNudgedAt for a session; null if unknown. */
export function getLastNudgedAt(state, watch, key) {
  const v = state?.[watch]?.sessions?.[key]?.lastNudgedAt;
  return typeof v === "string" ? v : null;
}

/** Surfacing event: advance lastSeenGeneration (preserves lastNudgedAt). */
export function recordSeen(state, watch, key, generation, nowIso) {
  const next = ensureSession(state, watch, key);
  next[watch].sessions[key].lastSeenGeneration = generation;
  next[watch].sessions[key].lastSeenAt = nowIso;
  return next;
}

/** Soft nudge: set lastNudgedAt (does NOT advance lastSeenGeneration). */
export function recordSoftNudge(state, watch, key, nowIso) {
  const next = ensureSession(state, watch, key);
  next[watch].sessions[key].lastNudgedAt = nowIso;
  next[watch].sessions[key].lastSeenAt = nowIso;
  return next;
}

/** Set the per-watch shared lastRefreshAt. */
export function setLastRefresh(state, watch, nowIso) {
  const next = { ...state };
  const w = next[watch] ?? { lastRefreshAt: null, sessions: {} };
  next[watch] = { ...w, sessions: { ...w.sessions }, lastRefreshAt: nowIso };
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

// ── config ──────────────────────────────────────────────────────────
/**
 * Resolve plugin config from an env-like object (default: process.env).
 * @param {Record<string,string|undefined>} [env]
 */
export function resolveConfig(env = process.env) {
  const watch = (env.OFOCUS_ASSISTANT_WATCH ?? "").trim() || "agent";
  const refreshIntervalMs = posIntOr(env.OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS, 300000);
  const nudgeIntervalMs = posIntOr(env.OFOCUS_ASSISTANT_NUDGE_INTERVAL_MS, 600000);
  const urgentDueToday = (env.OFOCUS_ASSISTANT_URGENT_DUE_TODAY ?? "true").trim().toLowerCase() !== "false";
  const agentTag = (env.OFOCUS_ASSISTANT_AGENT_TAG ?? "").trim() || null;
  const bin = (env.OFOCUS_BIN ?? "").trim() || "ofocus";
  const disabled = Boolean((env.OFOCUS_ASSISTANT_DISABLE ?? "").trim());
  const stateDir = (env.OFOCUS_STATE_DIR ?? "").trim() || join(homedir(), ".ofocus");
  return { watch, refreshIntervalMs, nudgeIntervalMs, urgentDueToday, agentTag, bin, disabled, stateDir };
}

function posIntOr(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Path to the hook's own state file. */
export function stateFilePath(stateDir) {
  return join(stateDir, "hook-state.json");
}
