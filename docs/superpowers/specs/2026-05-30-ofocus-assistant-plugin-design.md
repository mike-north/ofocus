# Layer B — The `ofocus-assistant` Claude Code Plugin

**Date:** 2026-05-30
**Status:** Design — pending review
**Layer:** **L3 — Agent interaction patterns** (a Claude Code plugin)
**North star:** [OFocus Agent Collaboration — Design Principles](./2026-05-30-ofocus-agent-principles.md)
(realizes pattern **4 — Push state, don't poll-and-diff**, and is the consumer of the L2 `ofocus changes` primitive)
**Builds on:** [A1 — `ofocus changes` primitive](./2026-05-30-ofocus-changes-primitive-design.md) (shipped in `@ofocus/productivity`)

---

## 1. Goal

Ship the agent-facing layer of the OmniFocus assistant: a Claude Code plugin that (a) proactively surfaces what changed in OmniFocus so the human-agent pair stays in sync, and (b) guides the agent through inbox triage and co-planning. It is the realization of the user's two priority scenarios — **monitoring/alerting** and **inbox triage / co-planning** — sitting on the shipped `ofocus changes` primitive.

The plugin orchestrates; it does not compute. All change detection, diffing, and bookkeeping live in the L2 tool (`ofocus changes`). The plugin is **pure CLI orchestration** — no changes to the tool are required.

## 2. Scope

**In scope (v1):**
- A **change-notification hook** (SessionStart digest + PreToolUse nudge).
- An **inbox-triage / co-planning skill**.
- The plugin manifest (`plugin.json`) to load them.

**Out of scope (deferred):**
- Bundling the MCP server in the plugin's `.mcp.json` (the plugin assumes the `ofocus` CLI is installed).
- Extra slash commands (`/ofocus-digest`, `/ofocus-triage`, `/ofocus-watch`).
- A formal human↔agent handoff tag/project convention.
- A marketplace entry (`marketplace.json`) for distribution.

## 3. Plugin structure

A self-contained plugin directory in-repo:

```
plugin/ofocus-assistant/
  .claude-plugin/
    plugin.json               # manifest: name, version, description, author
  hooks/
    hooks.json                # SessionStart + PreToolUse event → command bindings
    notify.mjs                # the hook script (Node ESM, zero-dependency)
  skills/
    ofocus-triage/
      SKILL.md                # inbox-triage / co-planning guidance
```

- `notify.mjs` is plain Node ESM using only built-ins (no bundling/deps), invoked via `node "${CLAUDE_PLUGIN_ROOT}/hooks/notify.mjs" <event>`.
- The skill is a standard `SKILL.md` with `name` + `description` frontmatter.

## 4. Component A — change-notification hook

### 4.1 Events and behavior

Every hook invocation derives a **session key** from its stdin payload, via a fallback chain
so it never depends on a single field being present:
1. `session_id` (Claude Code's documented per-session identifier), else
2. `transcript_path` (also unique per session, in the same payload), else
3. the literal `"_shared"` — degrades to a single shared cursor (pre-multi-agent behavior).

The plugin does **not** ask the agent to mint an id — the hook has no reliable channel to
receive one, so identity comes only from the payload/environment. The exact field name(s)
must be **confirmed empirically** with a probe hook early in implementation (§8.1); the
fallback chain means a wrong guess degrades gracefully rather than breaking.

All nudge tracking is **per session key** so concurrent agent sessions never silence each
other (§4.3). A single **shared watch** `<W>` (default `agent`) is used by all sessions — one
snapshot, one set of (shared, debounced) background scans. Reads are **non-draining** so a
session never mutates shared state; only the background `--refresh-inline` (shared work)
advances the snapshot.

**`SessionStart`** — digest for this session:
1. **Ensure freshness (shared):** if `now - lastRefreshAt > REFRESH_INTERVAL`, spawn a detached `ofocus changes --watch <W> --refresh-inline` and set `lastRefreshAt = now` (shared debounce).
2. **Peek (non-draining):** `ofocus changes --watch <W> --format json` → returns `pending` + `generation` without clearing or scanning.
3. If `pending` is non-empty, format a concise digest from `changes`/`summary` (e.g. *"Since the last refresh: 3 new inbox items, 1 newly overdue (Pay invoice), project 'Falcon' → on-hold."*) and emit it as `additionalContext`.
4. Set `sessions[session_id].lastNudgedGeneration = generation` (so PreToolUse won't immediately re-nudge this session for what it was just shown).

**`PreToolUse`** — lightweight nudge, at most once per change-batch **per session**:
1. **Peek (non-draining):** `ofocus changes --watch <W> --format json` → `pending` + `generation` (cheap; no OmniJS scan).
2. **Nudge condition:** if `summary` is non-empty **and** `generation > sessions[session_id].lastNudgedGeneration` → inject a one-line nudge:
   > 📥 OmniFocus changed (N items) since you last reviewed. If you don't already have a task to review the OmniFocus inbox/changes, add one to your task list.
   Then set `sessions[session_id].lastNudgedGeneration = generation`.
3. **Debounced refresh (shared):** if `now - lastRefreshAt > REFRESH_INTERVAL` (default 5 min), spawn a detached `ofocus changes --watch <W> --refresh-inline` and set `lastRefreshAt = now`.

A brand-new `session_id` has no stored cursor (treated as `-1`), so it gets the SessionStart
digest and is then nudged only for changes that arrive *after* it joined — exactly "what's
new for this agent."

### 4.2 Why this is correct and low-noise
- The nudge fires **at most once per new change-batch** — gated by the hook's `lastNudgedGeneration`, not per tool call.
- The *"if you don't already have a task"* clause is applied by the **agent** (which can see its own task list); the hook cannot, so it delegates that judgment.
- The hook **peeks without draining** (default read never clears `pending`), so the actual deltas remain for the agent to consume on its own schedule via the triage skill / `ofocus changes --pending` (draining) or `--fresh`. Two clean roles: **hook = signal; agent = consume**.
- The expensive OmniJS scan only runs on the debounced background refresh and at SessionStart — never inline on a tool call.

### 4.3 Hook-local state (per-session)
A small JSON file, separate from the tool's watch cache. `lastRefreshAt` is **per watch**
(shared debounce — the background scan benefits everyone); `lastNudgedGeneration` is **per
session_id**:
```
$OFOCUS_STATE_DIR/hook-state.json   (default $OFOCUS_STATE_DIR = ~/.ofocus)
{
  "<watch>": {
    "lastRefreshAt": "<ISO>",
    "sessions": {
      "<session_id>": { "lastNudgedGeneration": <n>, "lastSeenAt": "<ISO>" }
    }
  }
}
```
This is the plugin's own state — independent of the tool's `deliveredGeneration`. Notes:
- **Concurrent writes:** multiple sessions' hooks may update this file at once. Each write is a
  read-modify-write that touches only *its own* `session_id` entry (plus `lastRefreshAt`) and
  is written atomically (temp + rename). A rare lost update is self-healing — worst case a
  session is nudged once more than necessary; nothing is silently dropped from OmniFocus.
- **GC:** prune `sessions` entries whose `lastSeenAt` is older than a window (default 7 days)
  on each write, so the file can't grow unbounded. (A future `SessionEnd` hook could prune the
  ending session's entry immediately; deferred.)

### 4.4 Configuration (env)
- `OFOCUS_ASSISTANT_WATCH` — watch name (default `agent`).
- `OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS` — debounce interval (default `300000`).
- `OFOCUS_ASSISTANT_DISABLE` — if set, the hook no-ops (escape hatch).
- The `ofocus` CLI is located via `PATH`; if absent, the hook fails open (§4.6).

### 4.5 Hook output protocol — feasibility note
`SessionStart` reliably supports injecting `additionalContext`. **Whether `PreToolUse` supports `additionalContext` injection must be verified early in implementation** (via the `plugin-dev:hook-development` skill / current Claude Code hook docs). 
- **If PreToolUse supports `additionalContext`** → use it as designed.
- **If it does not** → fall back to **`UserPromptSubmit`** for the nudge (fires once per user turn, definitely supports `additionalContext`). The nudge model is identical; only the trigger boundary changes (turn vs tool call). This fallback is acceptable and pre-approved.

### 4.6 Error handling — fail-open and silent
A monitoring hook must never break the session. On any failure — `ofocus` not on PATH, non-zero exit, malformed JSON, OmniFocus not running, corrupt hook-state — the hook emits **no context** and exits 0. It never blocks a tool call or a turn. Background-refresh spawns are detached and their failures are ignored.

## 5. Component B — inbox-triage / co-planning skill

`skills/ofocus-triage/SKILL.md` — guidance (not code) the agent follows when the user asks to triage the inbox, plan, or review. Encodes the collaboration conventions:

- **Triage flow:** read the inbox (`ofocus tasks --in-inbox`), and for each item propose a disposition — project, tags, defer/due, flag, or "delete/drop" — then present the proposals as a **batch for the user's approval** before applying via `ofocus update` / `update-batch`. Never mutate without confirmation.
- **Co-planning:** break large/ambiguous tasks into subtasks (`ofocus subtask`); turn vague inbox notes into actionable next actions.
- **Review:** surface projects due for review (`ofocus projects-for-review`) and stalled work; mark reviewed (`ofocus review`).
- **Compute-don't-reason discipline:** for "what's due today / this week / what changed / workload," call the deterministic commands (`ofocus forecast`, `ofocus changes`, `ofocus stats`) rather than pulling raw task lists into context and reasoning over them. The skill explicitly points the agent at these.
- **Acting on a nudge:** when the agent has a self-created "review OmniFocus changes" task (from the hook nudge), it triages from **live state** — `ofocus tasks --in-inbox`, `--flagged`, `ofocus forecast` — rather than draining the shared delta log. (The shared watch's `--pending` drain is single-consumer and would clobber other concurrent sessions, so the multi-agent-safe path is to review current state; the nudge is only the *signal* that there's something to look at.)

The skill references the `ofocus` command surface (already documented in the generated `skills/ofocus/SKILL.md`) rather than restating it.

## 6. Testing

Per the project's multi-layer + spec-first conventions; a plugin is mostly config + a script + markdown.

- **Hook script unit tests (`notify.mjs`, vitest):** extract the pure logic into testable functions and assert:
  - **Digest formatting** — given a `changes` JSON payload, produces the expected human-readable summary (spec-derived strings, not snapshots).
  - **Per-session nudge decision** — nudges session S iff `pending` non-empty **and** `generation > sessions[S].lastNudgedGeneration`; does not nudge when S's generation is unchanged (idempotency) or pending is empty. **Multi-agent:** session A nudging (advancing A's cursor) does NOT silence session B — B with an older cursor still nudges. (The core multi-agent test.)
  - **Per-session state isolation** — a read-modify-write for session A preserves session B's entry; GC prunes only entries older than the window.
  - **Debounce decision** — spawns refresh iff `now - lastRefreshAt > interval` (shared, not per-session).
  - **Session-key fallback chain** — derives the key from `session_id`, else `transcript_path`, else `"_shared"`; tested for all three payload shapes.
  - **Fail-open** — malformed/empty CLI output or a thrown error yields no injected context and no throw (a missing session id degrades to the `"_shared"` key, not a crash).
  - Inject a fake `ofocus` (a stub executable / mocked exec), a synthetic hook stdin payload (varying which identifier fields are present), and a temp `OFOCUS_STATE_DIR`; never touch real OmniFocus.
- **Manifest validation:** validate `plugin.json` and `hooks.json` against the plugin schema (`plugin-dev:plugin-validator`).
- **Skill review:** run `plugin-dev:skill-reviewer` on `SKILL.md` for triggering quality and accuracy; verify every referenced command exists in the CLI.
- **Manual UAT** (not CI-automatable — loading a live plugin needs a Claude Code session; see `manual-test-design`): install the plugin, make an OmniFocus change, start a session → confirm the SessionStart digest; then within a session, after a background refresh, confirm a PreToolUse (or fallback) nudge appears exactly once and the agent self-schedules a review task. Document these steps in the plugin README.

## 7. File responsibilities (for the plan)

| File | Responsibility |
| --- | --- |
| `plugin/ofocus-assistant/.claude-plugin/plugin.json` | Manifest: identity + points at `hooks/hooks.json` and `skills/`. |
| `plugin/ofocus-assistant/hooks/hooks.json` | Binds `SessionStart` and `PreToolUse` (or fallback `UserPromptSubmit`) to `notify.mjs <event>`. |
| `plugin/ofocus-assistant/hooks/notify.mjs` | The hook: peek/digest/nudge/debounced-refresh + fail-open. Pure logic factored for unit tests. |
| `plugin/ofocus-assistant/skills/ofocus-triage/SKILL.md` | Triage / co-planning guidance. |
| `plugin/ofocus-assistant/README.md` | What it is, install, config env vars, the manual UAT steps. |
| `plugin/ofocus-assistant/tests/notify.test.ts` | Unit tests for the hook's pure logic. |

## 8. Open implementation questions (resolve during planning, not blocking design)

1. **Probe the hook payload (do this FIRST).** Add a throwaway hook that writes its raw stdin to a file, trigger it once, and confirm: (a) which events carry `session_id` and/or `transcript_path` and the exact field names, and (b) whether `PreToolUse` supports injecting `additionalContext`. This single probe resolves both the session-key chain (§4.1) and the injection mechanism (§4.5). If `PreToolUse` can't inject context, fall back to `UserPromptSubmit` (which carries the same identifiers). Do not write the real hook until this is confirmed.
2. **Hook-state write concurrency** — confirm atomic temp+rename read-modify-write is sufficient under realistic concurrency; decide whether a lightweight lockfile is worth it (current decision: no — accept rare self-healing lost updates, §4.3).
3. **Hook test runner wiring** — whether the plugin's `notify.test.ts` runs under the repo's existing vitest setup or a small standalone config (the plugin is outside the `packages/*` workspace).
4. **`ofocus` binary name** — the installed CLI bin is `ofocus-cli`; the umbrella `ofocus` package provides `ofocus`. Confirm which the hook should invoke (prefer `ofocus`, fall back to `ofocus-cli`).
5. **Plugin discovery** — whether to add a `.claude-plugin/marketplace.json` now for installability, or defer (currently deferred, §2).
