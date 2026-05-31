#!/usr/bin/env node
// ofocus-assistant hook entry. Reads a hook payload on stdin, peeks the shared
// ofocus watch (non-draining), and surfaces/nudges per the tiered model.
// Fail-open: ANY error → no output, exit 0. Never blocks a tool call or turn.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  resolveConfig, stateFilePath, readState, writeState, setLastRefresh,
  recordSeen, recordSoftNudge, getSeenGeneration, getLastNudgedAt, pruneSessions,
  sessionKey, shouldSurface, shouldRefresh, classifyUrgency,
  formatNudge, formatDigest, formatUrgent, endOfTodayMs,
} from "./lib.mjs";

function emit(obj) {
  if (obj && Object.keys(obj).length > 0) process.stdout.write(JSON.stringify(obj));
}

function peek(cfg) {
  const raw = execFileSync(cfg.bin, ["changes", "--watch", cfg.watch, "--format", "json"], {
    encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(raw);
  return parsed?.data ?? null;
}

function triggerRefresh(cfg) {
  try {
    const child = spawn(cfg.bin, ["changes", "--watch", cfg.watch, "--refresh-inline"], {
      detached: true, stdio: "ignore",
    });
    child.unref();
  } catch { /* fail-open */ }
}

function safeWrite(path, state) {
  try { writeState(path, state); } catch { /* fail-open */ }
}

function main() {
  let cfg;
  try { cfg = resolveConfig(process.env); } catch { return; }
  if (cfg.disabled) return;

  let payload;
  try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (!payload) return;

  const event = payload.hook_event_name;
  const key = sessionKey(payload);
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const path = stateFilePath(cfg.stateDir);

  let data;
  try { data = peek(cfg); } catch { return; }
  if (!data) return;

  const generation = typeof data.generation === "number" ? data.generation : 0;
  const summary = data.summary ?? { added: 0, updated: 0, removed: 0 };
  const pendingNonEmpty = (summary.added + summary.updated + summary.removed) > 0;

  let state = pruneSessions(readState(path), nowMs);

  if (shouldRefresh(state[cfg.watch]?.lastRefreshAt ?? null, nowMs, cfg.refreshIntervalMs)) {
    triggerRefresh(cfg);
    state = setLastRefresh(state, cfg.watch, nowIso);
  }

  const seen = getSeenGeneration(state, cfg.watch, key);
  const surface = shouldSurface({ seenGeneration: seen, generation, pendingNonEmpty });
  const urgentOpts = { dueThresholdMs: cfg.urgentDueToday ? endOfTodayMs(nowMs) : nowMs, agentTag: cfg.agentTag };

  if (event === "SessionStart") {
    if (surface) {
      const digest = formatDigest({ summary, changes: data.changes });
      state = recordSeen(state, cfg.watch, key, generation, nowIso);
      safeWrite(path, state);
      if (digest) emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: digest }, suppressOutput: true });
      return;
    }
    safeWrite(path, state);
    return;
  }

  if (event === "Stop") {
    if (surface) {
      const digest = formatDigest({ summary, changes: data.changes });
      state = recordSeen(state, cfg.watch, key, generation, nowIso);
      safeWrite(path, state);
      if (digest) emit({ systemMessage: digest, suppressOutput: true });
      return;
    }
    safeWrite(path, state);
    return;
  }

  // PreToolUse (and any other mid-turn event): urgent interjection or soft nudge.
  if (surface && classifyUrgency(data, urgentOpts)) {
    const msg = formatUrgent(data, urgentOpts);
    state = recordSeen(state, cfg.watch, key, generation, nowIso); // urgent advances cursor
    safeWrite(path, state);
    if (msg) emit({ systemMessage: msg, suppressOutput: true });
    return;
  }
  if (surface) {
    const lastNudgedAt = getLastNudgedAt(state, cfg.watch, key);
    const throttleOk = !lastNudgedAt || nowMs - Date.parse(lastNudgedAt) > cfg.nudgeIntervalMs;
    if (throttleOk) {
      const msg = formatNudge(summary);
      state = recordSoftNudge(state, cfg.watch, key, nowIso); // does NOT advance cursor
      safeWrite(path, state);
      if (msg) emit({ systemMessage: msg, suppressOutput: true });
      return;
    }
  }
  safeWrite(path, state);
}

try { main(); } catch { /* never throw out of a hook */ }
