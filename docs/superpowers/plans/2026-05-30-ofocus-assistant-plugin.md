# `ofocus-assistant` Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `ofocus-assistant` Claude Code plugin — a change-notification hook (SessionStart digest + PreToolUse per-session nudge) and an inbox-triage/co-planning skill — that consumes the shipped `ofocus changes` primitive.

**Architecture:** A self-contained plugin under `plugin/ofocus-assistant/`. The hook is plain Node ESM (`notify.mjs` + a pure `lib.mjs`) that **shells out to the `ofocus` CLI** (no package import — decoupled, zero runtime deps). All change detection lives in the L2 tool; the hook only orchestrates: non-draining peek → per-session-keyed nudge decision → debounced detached background refresh. Pure logic in `lib.mjs` is unit-tested; runtime context injection is confirmed by a manual UAT.

**Tech Stack:** Node ESM (`.mjs`, Node ≥20 built-ins only), Claude Code plugin format (`plugin.json` + `hooks/hooks.json`), vitest (standalone config for the plugin), the `ofocus` CLI.

**Spec:** [`docs/superpowers/specs/2026-05-30-ofocus-assistant-plugin-design.md`](../specs/2026-05-30-ofocus-assistant-plugin-design.md)
**Principles:** [`docs/superpowers/specs/2026-05-30-ofocus-agent-principles.md`](../specs/2026-05-30-ofocus-agent-principles.md)

**Commit conventions (every commit):** author `--author="Mike North <michael.l.north@gmail.com>"` (personal repo), no AI trailers, run from the worktree root `/Users/mnorth/Development/ofocus/.claude/worktrees/hopeful-ardinghelli-351d16`. Tests use **vitest**. Branch: `claude/ofocus-assistant-plugin` (already created off `main`).

> **REVISION (tiered urgency-aware model — supersedes the hook tasks below):** The spec
> moved to a tiered model (spec §4). The authoritative event/decision design is now:
> **SessionStart** (digest, advances `lastSeenGeneration`), **Stop** (end-of-turn surface,
> advances `lastSeenGeneration`), **PreToolUse** (gated: an *urgent* delta interjects + advances
> the cursor; otherwise a throttled, **non-advancing** soft nudge governed by `NUDGE_INTERVAL`).
> Urgency is a deterministic classifier over the peeked deltas (newly-overdue/due-today,
> newly-flagged, optional agent-tag gain). State per session: `lastSeenGeneration`,
> `lastNudgedAt`, `lastSeenAt`. New config: `OFOCUS_ASSISTANT_NUDGE_INTERVAL_MS`,
> `OFOCUS_ASSISTANT_URGENT_DUE_TODAY`, `OFOCUS_ASSISTANT_AGENT_TAG`.
> Tasks 1–2 (scaffold, `sessionKey`) and the unchanged helpers (`shouldRefresh`, `readState`,
> `writeState`, `setLastRefresh`, `pruneSessions`, `formatDigest`) stand as written. Tasks 3–7
> are executed against spec §4 (the controller dispatches the exact tiered-model code): the
> single-nudge `shouldNudge`/`recordNudge`/`lastNudgedGeneration` are replaced by
> `shouldSurface` + `classifyUrgency` + `formatUrgent` + `recordSeen`/`recordSoftNudge` +
> `lastSeenGeneration`, and `hooks.json` binds SessionStart **+ Stop +** PreToolUse.

---

## Authoritative facts (from hook-development skill + Claude Code docs)

- Every hook receives JSON on **stdin** with common fields: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`. Event-specific: PreToolUse adds `tool_name`/`tool_input`.
- **Plugin `hooks.json` format:** `{ "hooks": { "<Event>": [ { "matcher": "*", "hooks": [ { "type": "command", "command": "...", "timeout": 10 } ] } ] } }`.
- **Command hooks:** the `command` string runs in a shell; use `${CLAUDE_PLUGIN_ROOT}` for portable paths. Output is JSON on stdout; exit 0 = success.
- **Context injection:** SessionStart uses `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}`. PreToolUse uses `{"systemMessage":"…"}` ("Explanation for Claude"). Both honor `{"continue":true,"suppressOutput":true}`.
- **Hooks load at session start** — testing the live plugin requires restarting Claude Code (manual UAT only).

## File Structure

```
plugin/ofocus-assistant/
  .claude-plugin/plugin.json        # manifest
  hooks/hooks.json                  # SessionStart + PreToolUse bindings → notify.mjs
  hooks/lib.mjs                     # PURE logic (session key, nudge/refresh decisions, formatting, state I/O)
  hooks/notify.mjs                  # entry: stdin → lib → ofocus CLI → stdout (fail-open)
  skills/ofocus-triage/SKILL.md     # inbox-triage / co-planning guidance
  tests/lib.test.mjs                # unit tests for lib.mjs
  tests/notify.test.mjs             # integration test: notify.mjs subprocess w/ stub ofocus
  vitest.config.ts                  # standalone vitest config for the plugin
  README.md                         # what it is, install, env config, manual UAT steps
```
Root `package.json`: add a `test:plugin` script and chain it into `test`.

---

## Task 1: Scaffold the plugin + manifest + test runner

**Files:**
- Create: `plugin/ofocus-assistant/.claude-plugin/plugin.json`
- Create: `plugin/ofocus-assistant/hooks/lib.mjs` (placeholder)
- Create: `plugin/ofocus-assistant/tests/lib.test.mjs` (smoke)
- Create: `plugin/ofocus-assistant/vitest.config.ts`
- Modify: root `package.json`

- [ ] **Step 1: Create `plugin/ofocus-assistant/.claude-plugin/plugin.json`**

```json
{
  "name": "ofocus-assistant",
  "version": "0.1.0",
  "description": "OmniFocus AI assistant: proactive change notifications + inbox triage and co-planning, built on the ofocus CLI.",
  "author": { "name": "Mike North" }
}
```

- [ ] **Step 2: Create placeholder `plugin/ofocus-assistant/hooks/lib.mjs`**

```javascript
// Pure, dependency-free helpers for the ofocus-assistant hook.
// Populated by later tasks.
export const PLUGIN_NAME = "ofocus-assistant";
```

- [ ] **Step 3: Create `plugin/ofocus-assistant/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    environment: "node",
    root: import.meta.dirname,
  },
});
```

- [ ] **Step 4: Create smoke test `plugin/ofocus-assistant/tests/lib.test.mjs`**

```javascript
import { describe, it, expect } from "vitest";
import { PLUGIN_NAME } from "../hooks/lib.mjs";

describe("plugin scaffold", () => {
  it("exposes the plugin name", () => {
    expect(PLUGIN_NAME).toBe("ofocus-assistant");
  });
});
```

- [ ] **Step 5: Wire the plugin tests into the root `package.json`**

In root `package.json` `scripts`, add:
```json
"test:plugin": "vitest run --config plugin/ofocus-assistant/vitest.config.ts"
```
and change the existing `test` script so the plugin tests run too. Current:
```
"test": "pnpm -r run test && vitest run --config scripts/vitest.config.ts"
```
becomes:
```
"test": "pnpm -r run test && vitest run --config scripts/vitest.config.ts && pnpm test:plugin"
```

- [ ] **Step 6: Run the smoke test**

Run: `pnpm test:plugin`
Expected: 1 test passes.

- [ ] **Step 7: Validate the manifest JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('plugin/ofocus-assistant/.claude-plugin/plugin.json','utf8')); console.log('valid')"`
Expected: `valid`.

- [ ] **Step 8: Commit**

```bash
git add plugin/ofocus-assistant package.json
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): scaffold ofocus-assistant plugin + test runner"
```

---

## Task 2: Session key (fallback chain)

**Files:** Modify `plugin/ofocus-assistant/hooks/lib.mjs`; Test `plugin/ofocus-assistant/tests/lib.test.mjs`

- [ ] **Step 1: Add the failing test** (append to `lib.test.mjs`)

```javascript
import { sessionKey } from "../hooks/lib.mjs";

describe("sessionKey", () => {
  it("prefers session_id", () => {
    expect(sessionKey({ session_id: "s1", transcript_path: "/t" })).toBe("s1");
  });
  it("falls back to transcript_path", () => {
    expect(sessionKey({ transcript_path: "/path/x.jsonl" })).toBe("/path/x.jsonl");
  });
  it("falls back to _shared when neither present", () => {
    expect(sessionKey({})).toBe("_shared");
    expect(sessionKey({ session_id: "" })).toBe("_shared");
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm test:plugin`
Expected: FAIL — `sessionKey` is not exported.

- [ ] **Step 3: Implement `sessionKey` in `lib.mjs`**

```javascript
/**
 * Derive a stable per-session key from a hook stdin payload, via a fallback
 * chain so it never depends on one field. Inherits Claude Code's session
 * identity (fork → diverges, resume → continues). Never agent-generated.
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
```

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm test:plugin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/hooks/lib.mjs plugin/ofocus-assistant/tests/lib.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): session key with session_id→transcript_path→_shared fallback"
```

---

## Task 3: Nudge and refresh decisions

**Files:** Modify `lib.mjs`; Test `lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```javascript
import { shouldNudge, shouldRefresh } from "../hooks/lib.mjs";

describe("shouldNudge", () => {
  it("nudges when pending is non-empty and generation > cursor", () => {
    expect(shouldNudge({ cursor: 2, generation: 3, pendingNonEmpty: true })).toBe(true);
  });
  it("does not nudge when generation == cursor (already nudged)", () => {
    expect(shouldNudge({ cursor: 3, generation: 3, pendingNonEmpty: true })).toBe(false);
  });
  it("does not nudge when pending is empty", () => {
    expect(shouldNudge({ cursor: 0, generation: 5, pendingNonEmpty: false })).toBe(false);
  });
  it("treats a missing cursor as -1 (new session nudges on any pending)", () => {
    expect(shouldNudge({ cursor: -1, generation: 0, pendingNonEmpty: true })).toBe(true);
  });
});

describe("shouldRefresh", () => {
  it("refreshes when no prior refresh", () => {
    expect(shouldRefresh(null, 1000, 500)).toBe(true);
  });
  it("refreshes when older than the interval", () => {
    expect(shouldRefresh("1970-01-01T00:00:00.000Z", 600, 500)).toBe(true);
  });
  it("debounces when within the interval", () => {
    expect(shouldRefresh("1970-01-01T00:00:00.300Z", 600, 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm test:plugin` — Expected: FAIL (functions undefined).

- [ ] **Step 3: Implement in `lib.mjs`**

```javascript
/**
 * Decide whether to nudge THIS session. Generation-gated per session so
 * concurrent sessions don't silence each other.
 * @param {{cursor: number, generation: number, pendingNonEmpty: boolean}} args
 */
export function shouldNudge({ cursor, generation, pendingNonEmpty }) {
  return pendingNonEmpty && generation > cursor;
}

/**
 * Decide whether to trigger a (shared) background refresh.
 * @param {string|null} lastRefreshAt ISO timestamp or null
 * @param {number} nowMs current time in ms
 * @param {number} intervalMs debounce interval
 */
export function shouldRefresh(lastRefreshAt, nowMs, intervalMs) {
  if (!lastRefreshAt) return true;
  const last = Date.parse(lastRefreshAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last > intervalMs;
}
```

- [ ] **Step 4: Run, confirm PASS** — Run: `pnpm test:plugin`

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/hooks/lib.mjs plugin/ofocus-assistant/tests/lib.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): per-session nudge + debounced refresh decisions"
```

---

## Task 4: Digest and nudge message formatting

**Files:** Modify `lib.mjs`; Test `lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```javascript
import { formatNudge, formatDigest } from "../hooks/lib.mjs";

const summary = { added: 2, updated: 1, removed: 0 };
const changes = {
  summary,
  changes: {
    added: [{ object: { name: "Call dentist" } }, { object: { name: "Buy milk" } }],
    updated: [{ object: { name: "Pay invoice" }, delta: { dueDate: { from: "2026-06-02", to: "2026-05-30" } } }],
    removed: [],
  },
};

describe("formatNudge", () => {
  it("states the total item count and the self-dedup instruction", () => {
    const msg = formatNudge(summary);
    expect(msg).toContain("3"); // 2 + 1 + 0
    expect(msg).toMatch(/task list/i);
  });
  it("returns empty string for an all-zero summary", () => {
    expect(formatNudge({ added: 0, updated: 0, removed: 0 })).toBe("");
  });
});

describe("formatDigest", () => {
  it("summarizes counts and names a few items", () => {
    const d = formatDigest(changes);
    expect(d).toContain("2 added");
    expect(d).toContain("1 updated");
    expect(d).toContain("Call dentist");
  });
  it("returns empty string when nothing changed", () => {
    expect(formatDigest({ summary: { added: 0, updated: 0, removed: 0 }, changes: { added: [], updated: [], removed: [] } })).toBe("");
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — Run: `pnpm test:plugin`

- [ ] **Step 3: Implement in `lib.mjs`**

```javascript
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
```

- [ ] **Step 4: Run, confirm PASS** — Run: `pnpm test:plugin`

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/hooks/lib.mjs plugin/ofocus-assistant/tests/lib.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): digest and nudge message formatting"
```

---

## Task 5: Per-session state file (read/write/update/GC)

**Files:** Modify `lib.mjs`; Test `lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```javascript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, getCursor, recordNudge, setLastRefresh } from "../hooks/lib.mjs";

describe("hook state", () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofa-state-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const path = () => join(dir, "hook-state.json");

  it("returns an empty object when the state file is absent", () => {
    expect(readState(path())).toEqual({});
  });

  it("getCursor returns -1 for an unknown session", () => {
    expect(getCursor({}, "agent", "s1")).toBe(-1);
  });

  it("recordNudge stores the cursor per session without disturbing others", () => {
    let st = recordNudge({}, "agent", "A", 3, "2026-05-30T00:00:00.000Z");
    st = recordNudge(st, "agent", "B", 1, "2026-05-30T00:00:00.000Z");
    expect(getCursor(st, "agent", "A")).toBe(3);
    expect(getCursor(st, "agent", "B")).toBe(1);
  });

  it("GC prunes sessions older than the window on write-time prune", () => {
    let st = recordNudge({}, "agent", "old", 1, "2020-01-01T00:00:00.000Z");
    st = recordNudge(st, "agent", "new", 2, "2026-05-30T00:00:00.000Z");
    const nowMs = Date.parse("2026-05-30T00:00:00.000Z");
    const pruned = pruneSessions(st, nowMs, 7 * 24 * 3600 * 1000);
    expect(getCursor(pruned, "agent", "old")).toBe(-1);
    expect(getCursor(pruned, "agent", "new")).toBe(2);
  });

  it("setLastRefresh is per-watch and round-trips through write/read", () => {
    let st = setLastRefresh({}, "agent", "2026-05-30T00:00:00.000Z");
    writeState(path(), st);
    expect(readState(path())["agent"].lastRefreshAt).toBe("2026-05-30T00:00:00.000Z");
  });
});
```
(Add `pruneSessions` to the import list at the top of this describe block.)

- [ ] **Step 2: Run, confirm FAIL** — Run: `pnpm test:plugin`

- [ ] **Step 3: Implement in `lib.mjs`**

```javascript
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SESSION_GC_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** Read the hook state file; {} if absent or unreadable/corrupt (fail-open). */
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
  next[watch] = next[watch] ?? { lastRefreshAt: null, sessions: {} };
  next[watch] = { ...next[watch], sessions: { ...next[watch].sessions } };
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
```

- [ ] **Step 4: Run, confirm PASS** — Run: `pnpm test:plugin`

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/hooks/lib.mjs plugin/ofocus-assistant/tests/lib.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): per-session hook state with atomic write and GC"
```

---

## Task 6: Config resolution + ofocus binary location

**Files:** Modify `lib.mjs`; Test `lib.test.mjs`

- [ ] **Step 1: Add the failing test**

```javascript
import { resolveConfig } from "../hooks/lib.mjs";

describe("resolveConfig", () => {
  it("uses defaults when env is empty", () => {
    const c = resolveConfig({});
    expect(c.watch).toBe("agent");
    expect(c.refreshIntervalMs).toBe(300000);
    expect(c.bin).toBe("ofocus");
    expect(c.disabled).toBe(false);
    expect(c.stateDir.length).toBeGreaterThan(0);
  });
  it("honors env overrides", () => {
    const c = resolveConfig({
      OFOCUS_ASSISTANT_WATCH: "work",
      OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "60000",
      OFOCUS_BIN: "/usr/local/bin/ofocus",
      OFOCUS_ASSISTANT_DISABLE: "1",
      OFOCUS_STATE_DIR: "/tmp/x",
    });
    expect(c).toMatchObject({ watch: "work", refreshIntervalMs: 60000, bin: "/usr/local/bin/ofocus", disabled: true, stateDir: "/tmp/x" });
  });
  it("ignores a non-numeric interval and uses the default", () => {
    expect(resolveConfig({ OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS: "abc" }).refreshIntervalMs).toBe(300000);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL** — Run: `pnpm test:plugin`

- [ ] **Step 3: Implement in `lib.mjs`**

```javascript
import { homedir } from "node:os";
import { join } from "node:path";

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
```

- [ ] **Step 4: Run, confirm PASS** — Run: `pnpm test:plugin`

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/hooks/lib.mjs plugin/ofocus-assistant/tests/lib.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): config resolution and ofocus binary location"
```

---

## Task 7: The hook entry (`notify.mjs`) + `hooks.json`

**Files:**
- Create: `plugin/ofocus-assistant/hooks/notify.mjs`
- Create: `plugin/ofocus-assistant/hooks/hooks.json`
- Create: `plugin/ofocus-assistant/tests/notify.test.mjs`

- [ ] **Step 1: Create `hooks/hooks.json`**

```json
{
  "description": "OmniFocus assistant: SessionStart digest + PreToolUse change nudge.",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/notify.mjs\"", "timeout": 15 }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/notify.mjs\"", "timeout": 10 }
        ]
      }
    ]
  }
}
```
The script dispatches on `hook_event_name` read from stdin (not argv), so one binding form works for both events.

- [ ] **Step 2: Write the failing integration test `tests/notify.test.mjs`**

This runs `notify.mjs` as a subprocess with synthetic stdin, a **stub `ofocus`** (a tiny node script that prints canned `changes` JSON), and a temp `OFOCUS_STATE_DIR`. It asserts the emitted hook-output JSON.

```javascript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const NOTIFY = resolve(here, "../hooks/notify.mjs");

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ofa-notify-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

// Write a stub `ofocus` executable that emits the given JSON for `changes`.
function stubOfocus(changesJson) {
  const bin = join(dir, "ofocus");
  writeFileSync(
    bin,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(changesJson))});\n`,
    "utf8",
  );
  chmodSync(bin, 0o755);
  return bin;
}

function runNotify(payload, changesJson, extraEnv = {}) {
  const bin = stubOfocus(changesJson);
  const out = execFileSync("node", [NOTIFY], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, OFOCUS_BIN: bin, OFOCUS_STATE_DIR: dir, ...extraEnv },
  });
  return out.trim() ? JSON.parse(out) : {};
}

const pendingChanges = {
  success: true,
  data: { generation: 4, summary: { added: 1, updated: 0, removed: 0 }, changes: { added: [{ object: { name: "Call dentist" } }], updated: [], removed: [] } },
  error: null,
};
const emptyChanges = {
  success: true,
  data: { generation: 4, summary: { added: 0, updated: 0, removed: 0 }, changes: { added: [], updated: [], removed: [] } },
  error: null,
};

describe("notify.mjs", () => {
  it("SessionStart injects a digest via additionalContext when pending exists", () => {
    const out = runNotify({ hook_event_name: "SessionStart", session_id: "s1" }, pendingChanges);
    expect(out.hookSpecificOutput?.additionalContext).toMatch(/Call dentist/);
  });

  it("PreToolUse nudges via systemMessage on first new change for the session", () => {
    const out = runNotify({ hook_event_name: "PreToolUse", session_id: "s1", tool_name: "Read" }, pendingChanges);
    expect(out.systemMessage).toMatch(/OmniFocus changed/);
  });

  it("PreToolUse is quiet (no systemMessage) when nothing is pending", () => {
    const out = runNotify({ hook_event_name: "PreToolUse", session_id: "s1" }, emptyChanges);
    expect(out.systemMessage ?? "").toBe("");
  });

  it("multi-agent: a second session still gets nudged after the first did", () => {
    runNotify({ hook_event_name: "PreToolUse", session_id: "A" }, pendingChanges); // A nudged → cursor A=4
    const outB = runNotify({ hook_event_name: "PreToolUse", session_id: "B" }, pendingChanges);
    expect(outB.systemMessage).toMatch(/OmniFocus changed/); // B not silenced by A
  });

  it("is quiet for the SAME session once it has been nudged at this generation", () => {
    runNotify({ hook_event_name: "PreToolUse", session_id: "A" }, pendingChanges); // cursor A=4
    const again = runNotify({ hook_event_name: "PreToolUse", session_id: "A" }, pendingChanges);
    expect(again.systemMessage ?? "").toBe("");
  });

  it("fails open (empty output, exit 0) when ofocus errors", () => {
    // Point OFOCUS_BIN at a missing binary.
    const out = execFileSync("node", [NOTIFY], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s1" }),
      encoding: "utf8",
      env: { ...process.env, OFOCUS_BIN: join(dir, "does-not-exist"), OFOCUS_STATE_DIR: dir },
    });
    expect(out.trim()).toBe(""); // no output, and execFileSync did not throw (exit 0)
  });

  it("DISABLE env makes it a silent no-op", () => {
    const out = runNotify({ hook_event_name: "PreToolUse", session_id: "s1" }, pendingChanges, { OFOCUS_ASSISTANT_DISABLE: "1" });
    expect(out).toEqual({});
  });
});
```

- [ ] **Step 3: Run, confirm FAIL** — Run: `pnpm test:plugin` (notify.mjs missing).

- [ ] **Step 4: Implement `hooks/notify.mjs`**

```javascript
#!/usr/bin/env node
// ofocus-assistant hook entry. Reads a hook payload on stdin, peeks the shared
// ofocus watch (non-draining), and emits a per-session digest (SessionStart) or
// nudge (PreToolUse). Fail-open: ANY error → no output, exit 0. Never blocks.

import { execFileSync, spawn } from "node:child_process";
import {
  resolveConfig,
  stateFilePath,
  readState,
  writeState,
  setLastRefresh,
  recordNudge,
  getCursor,
  pruneSessions,
  sessionKey,
  shouldNudge,
  shouldRefresh,
  formatNudge,
  formatDigest,
} from "./lib.mjs";

function readStdin() {
  try {
    return JSON.parse(readFileSyncStdin());
  } catch {
    return null;
  }
}
function readFileSyncStdin() {
  // Node: read all of fd 0 synchronously.
  const { readFileSync } = require("node:fs"); // eslint-disable-line
  return readFileSync(0, "utf8");
}

function emit(obj) {
  if (obj && Object.keys(obj).length > 0) process.stdout.write(JSON.stringify(obj));
}

function peek(cfg) {
  // Non-draining default read. Returns parsed data or null on any failure.
  const raw = execFileSync(cfg.bin, ["changes", "--watch", cfg.watch, "--format", "json"], {
    encoding: "utf8",
    timeout: 8000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed = JSON.parse(raw);
  return parsed?.data ?? null;
}

function triggerRefresh(cfg) {
  try {
    const child = spawn(cfg.bin, ["changes", "--watch", cfg.watch, "--refresh-inline"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    /* fail-open */
  }
}

function main() {
  let cfg;
  try {
    cfg = resolveConfig(process.env);
    if (cfg.disabled) return;
  } catch {
    return;
  }

  const payload = readStdin();
  if (!payload) return;
  const event = payload.hook_event_name;
  const key = sessionKey(payload);
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const path = stateFilePath(cfg.stateDir);

  let data;
  try {
    data = peek(cfg);
  } catch {
    return; // ofocus unavailable / error → fail-open
  }
  if (!data) return;

  const generation = typeof data.generation === "number" ? data.generation : 0;
  const summary = data.summary ?? { added: 0, updated: 0, removed: 0 };
  const pendingNonEmpty = (summary.added + summary.updated + summary.removed) > 0;

  let state = pruneSessions(readState(path), nowMs);

  // Debounced shared background refresh (both events).
  if (shouldRefresh(state[cfg.watch]?.lastRefreshAt ?? null, nowMs, cfg.refreshIntervalMs)) {
    triggerRefresh(cfg);
    state = setLastRefresh(state, cfg.watch, nowIso);
  }

  if (event === "SessionStart") {
    const digest = formatDigest({ summary, changes: data.changes });
    state = recordNudge(state, cfg.watch, key, generation, nowIso);
    safeWrite(path, state);
    if (digest) {
      emit({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: digest }, suppressOutput: true });
    }
    return;
  }

  // PreToolUse (and any other event): per-session nudge.
  const cursor = getCursor(state, cfg.watch, key);
  if (shouldNudge({ cursor, generation, pendingNonEmpty })) {
    const msg = formatNudge(summary);
    state = recordNudge(state, cfg.watch, key, generation, nowIso);
    safeWrite(path, state);
    if (msg) emit({ systemMessage: msg, suppressOutput: true });
    return;
  }
  safeWrite(path, state);
}

function safeWrite(path, state) {
  try {
    writeState(path, state);
  } catch {
    /* fail-open */
  }
}

try {
  main();
} catch {
  /* fail-open: never throw out of a hook */
}
```

NOTE for the implementer: `.mjs` is ESM, so `require` is not available. Replace the `readFileSyncStdin` helper's `require` with a top-level `import { readFileSync } from "node:fs"` and use `readFileSync(0, "utf8")`. (The stub above intentionally flags this — wire the import at the top and delete the `require` line; confirm `node hooks/notify.mjs < payload.json` reads stdin.)

- [ ] **Step 5: Run, confirm PASS** — Run: `pnpm test:plugin`
Expected: all `notify.mjs` tests pass (digest, nudge, quiet, multi-agent, same-session-quiet, fail-open, disable).

- [ ] **Step 6: Validate `hooks.json`**

Run: `node -e "JSON.parse(require('fs').readFileSync('plugin/ofocus-assistant/hooks/hooks.json','utf8')); console.log('valid')"`
Expected: `valid`.

- [ ] **Step 7: Commit**

```bash
git add plugin/ofocus-assistant/hooks/notify.mjs plugin/ofocus-assistant/hooks/hooks.json plugin/ofocus-assistant/tests/notify.test.mjs
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): change-notification hook (SessionStart digest + PreToolUse nudge)"
```

---

## Task 8: Inbox-triage / co-planning skill

**Files:** Create `plugin/ofocus-assistant/skills/ofocus-triage/SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: ofocus-triage
description: Triage the OmniFocus inbox and co-plan with the user. Use when the user asks to process/triage their inbox, plan or break down tasks, run a weekly review, or when acting on an "OmniFocus changed" nudge. Proposes dispositions for approval and applies them via the ofocus CLI.
---

# OmniFocus Inbox Triage & Co-Planning

Use the `ofocus` CLI (see the `ofocus` skill for the full command reference). **Compute, don't reason:** for "due today / this week / what changed / workload," call `ofocus forecast`, `ofocus changes`, and `ofocus stats` rather than pulling raw task lists into context and reasoning over them.

## Triage the inbox
1. Read the inbox: `ofocus tasks --in-inbox --format json`.
2. For each item, decide a proposed disposition: a project, tags, defer/due dates, flag, or drop/delete.
3. **Present all proposals as one batch for the user to approve or amend. Never mutate without confirmation.**
4. On approval, apply with `ofocus update <id> …` (or `ofocus update-batch <ids…>` for shared changes; `ofocus complete`/`drop`/`delete` as decided).

## Co-plan
- Break large or vague items into concrete next actions with `ofocus subtask <parent-id> "<title>"`.
- Turn an inbox note into an actionable task title + project.

## Weekly review
- `ofocus projects-for-review` → walk each; after reviewing, `ofocus review <project-id>`.
- Surface stalled projects (active projects with no available next action) for attention.

## Acting on a change nudge
When you have a self-created "review OmniFocus changes" task (from the assistant's nudge), review **live state** — `ofocus tasks --in-inbox`, `ofocus tasks --flagged`, `ofocus forecast` — and triage what's there. Do not rely on the change log; the nudge is only the signal that something is worth a look.
```

- [ ] **Step 2: Verify referenced commands exist**

Run: `grep -oE "ofocus [a-z-]+" plugin/ofocus-assistant/skills/ofocus-triage/SKILL.md | sort -u`
Then cross-check each against `node packages/cli/dist/index.js list-commands --format json` (build first if needed). Expected: every referenced command (`tasks`, `update`, `update-batch`, `complete`, `drop`, `delete`, `subtask`, `projects-for-review`, `review`, `forecast`, `stats`, `changes`) is present.

- [ ] **Step 3: Commit**

```bash
git add plugin/ofocus-assistant/skills/ofocus-triage/SKILL.md
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "feat(plugin): inbox-triage / co-planning skill"
```

---

## Task 9: README, manifest hook wiring, validation, and clean run

**Files:**
- Create: `plugin/ofocus-assistant/README.md`
- Verify: `plugin.json` references hooks (Claude Code auto-discovers `hooks/hooks.json` and `skills/` by convention — confirm no explicit manifest field is required; if it is, add it).

- [ ] **Step 1: Write `plugin/ofocus-assistant/README.md`**

````markdown
# ofocus-assistant

A Claude Code plugin that turns OmniFocus into a collaborative surface: it proactively surfaces what changed and helps triage your inbox and plan — built on the `ofocus` CLI.

> Requires macOS with OmniFocus and the `ofocus` CLI installed and on `PATH`.

## What it does
- **SessionStart digest** — when a session starts, injects a short summary of what changed in OmniFocus since the last refresh.
- **PreToolUse nudge** — once per new change-batch *per session*, injects a one-line reminder to add a "review OmniFocus" task (the agent dedups against its own task list). Tracking is keyed by the hook's session identity, so concurrent sessions don't silence each other.
- **Triage skill** — `ofocus-triage` guides inbox processing, task breakdown, and weekly review (propose-then-apply).

## Configuration (env)
| Variable | Default | Meaning |
| --- | --- | --- |
| `OFOCUS_ASSISTANT_WATCH` | `agent` | The shared `ofocus changes` watch name. |
| `OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS` | `300000` | Debounce for the background refresh. |
| `OFOCUS_BIN` | `ofocus` | Path/name of the ofocus CLI. |
| `OFOCUS_STATE_DIR` | `~/.ofocus` | Where the watch cache and hook state live. |
| `OFOCUS_ASSISTANT_DISABLE` | (unset) | If set, the hook is a silent no-op. |

The hook is **fail-open**: if `ofocus` is missing or errors, it injects nothing and never blocks a tool call.

## Manual test (hooks load at session start — restart required)
1. Install/enable the plugin and restart Claude Code.
2. `ofocus changes --watch agent --reset` to baseline.
3. Add an item to the OmniFocus inbox.
4. Wait for the debounce, trigger a tool call → confirm a one-line nudge appears **once**; confirm a second session also gets nudged.
5. Start a fresh session → confirm the SessionStart digest names the change.
````

- [ ] **Step 2: Confirm hook/skill discovery**

Check current Claude Code plugin conventions: confirm `hooks/hooks.json` and `skills/*/SKILL.md` are auto-discovered from the plugin root, or whether `plugin.json` must list them. If a manifest field is required (e.g. `"hooks": "./hooks/hooks.json"`), add it to `plugin.json`. Validate with the plugin validator if available:
Run: `node -e "JSON.parse(require('fs').readFileSync('plugin/ofocus-assistant/.claude-plugin/plugin.json','utf8'))"` and the `plugin-dev:plugin-validator` agent/skill on `plugin/ofocus-assistant`.

- [ ] **Step 3: Full clean build/lint/test gate**

Invoke `/clean_blt`. Ensure `pnpm build`, `pnpm lint`, and `pnpm test` (now including `pnpm test:plugin`) all pass from a clean state. Fix and re-run until green.

- [ ] **Step 4: Changeset**

The plugin is not a published npm package, so no changeset is required for it. If `pnpm changeset status` complains about changed files with no changeset, add an empty/devtools changeset noting "ofocus-assistant plugin (not published)". Otherwise skip.

- [ ] **Step 5: Commit**

```bash
git add plugin/ofocus-assistant/README.md plugin/ofocus-assistant/.claude-plugin/plugin.json
GIT_EDITOR=true git commit --author="Mike North <michael.l.north@gmail.com>" -m "docs(plugin): ofocus-assistant README + manifest wiring"
```

---

## Self-Review

**Spec coverage:**
- Plugin structure (§3) → Task 1, 7, 8, 9.
- SessionStart digest (§4.1) → Task 4 (format) + Task 7 (wiring, additionalContext).
- PreToolUse per-session nudge (§4.1, §4.2) → Task 3 (decision) + Task 4 (format) + Task 7 (wiring, systemMessage); multi-agent + same-session-quiet tests in Task 7.
- Session-key fallback chain (§4.1) → Task 2 (+ Task 7 uses it; fail-open covers absent ids).
- Per-session state + concurrency + GC (§4.3) → Task 5.
- Debounced shared refresh (§4.1) → Task 3 (decision) + Task 7 (detached spawn).
- Config/env (§4.4) → Task 6.
- Injection mechanism + feasibility (§4.5) → Task 7 (additionalContext for SessionStart, systemMessage for PreToolUse); runtime visibility confirmed by the manual UAT (Task 9 README).
- Fail-open (§4.6) → Task 7 (every error path → no output, exit 0) + the fail-open test.
- Triage/co-planning skill (§5) → Task 8.
- Testing (§6) → unit tests Tasks 2–6; integration Task 7; manifest/skill validation + manual UAT Task 9.

**Known follow-ups (documented, not in this plan):** a `SessionEnd` hook for immediate per-session GC; a `marketplace.json` for distribution; MCP-server bundling; slash commands. All deferred per spec §2/§8.

**Placeholder scan:** No "TBD"/"implement later". One explicit implementer NOTE in Task 7 step 4 (the `readFileSyncStdin` `require`→`import` correction) is intentional guidance, with the exact fix stated — not a placeholder.

**Type/name consistency:** `sessionKey`, `shouldNudge({cursor,generation,pendingNonEmpty})`, `shouldRefresh(lastRefreshAt,nowMs,intervalMs)`, `formatNudge(summary)`, `formatDigest({summary,changes})`, `readState/writeState/getCursor/recordNudge/setLastRefresh/pruneSessions`, `resolveConfig/stateFilePath` are defined once (Tasks 2–6) and used with identical signatures in `notify.mjs` (Task 7). The `ofocus changes` JSON envelope (`{success,data:{generation,summary,changes},error}`) matches the shipped CLI contract (confirmed during Layer A: the CLI emits the `{success,data,error}` envelope).
