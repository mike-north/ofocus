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

- A **change-notification hook** with a **tiered, urgency-aware** model: a SessionStart digest, an **end-of-turn** surface, and a **gated PreToolUse** interjection (urgent-now vs occasional soft nudge). Multi-agent-safe (per-session cursors).
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
    hooks.json                # SessionStart + Stop + PreToolUse event → command bindings
    notify.mjs                # the hook script (Node ESM, zero-dependency)
  skills/
    ofocus-triage/
      SKILL.md                # inbox-triage / co-planning guidance
```

- `notify.mjs` is plain Node ESM using only built-ins (no bundling/deps), invoked via `node "${CLAUDE_PLUGIN_ROOT}/hooks/notify.mjs" <event>`.
- The skill is a standard `SKILL.md` with `name` + `description` frontmatter.

## 4. Component A — change-notification hook

### 4.0 Model in one paragraph

A single **shared watch** `<W>` (default `agent`) — one snapshot, one set of shared,
debounced background scans. Every session tracks its own **`lastSeenGeneration`** cursor
(keyed by a session key, §4.1), so concurrent sessions never silence each other. The hook
only ever **peeks** (`ofocus changes --watch <W> --format json` — returns `pending` +
`generation` without draining or scanning); the expensive OmniJS scan happens only on the
shared, debounced background `--refresh-inline`. **Surfacing events** (SessionStart,
end-of-turn) bring a session "up to date" and advance its cursor; **PreToolUse** is a gated
mid-turn interjection for the _urgent_ case (and an occasional non-advancing soft nudge).
Two clean roles: **hook = signal; agent = consume** (the agent consumes deltas on its own
schedule via the triage skill / live state).

### 4.1 Session key (multi-agent identity)

Every hook invocation derives a **session key** from its stdin payload, via a fallback chain
so it never depends on a single field being present:

1. `session_id` (Claude Code's documented per-session identifier), else
2. `transcript_path` (also unique per session, in the same payload), else
3. the literal `"_shared"` — degrades to a single shared cursor (pre-multi-agent behavior).

The plugin does **not** ask the agent to mint an id — the hook has no reliable channel to
receive one, so identity comes only from the payload/environment. The exact field name(s)
must be **confirmed empirically** with a probe hook early in implementation (§8.1); the
fallback chain means a wrong guess degrades gracefully rather than breaking.

**Why payload-derived, not agent-generated (fork/resume rationale):** a payload key inherits
Claude Code's own session identity. **Forking** a session yields a fresh `session_id` /
`transcript_path`, so the branches diverge and track independently (neither silences the
other). **Resuming** the same session keeps the same identity, so monitoring continues
seamlessly. An agent-remembered id gets both wrong — it is copied into the conversation
history, so a fork carries the _same_ id into both branches (a shared-cursor collision), and
it can drift across compaction. By never owning identity, the hook gets correct fork/resume
behavior for free.

### 4.2 Events and behavior

`<W>` is the shared watch; `lastSeenGeneration` is per session key; `lastRefreshAt` is per
watch (shared). "Ensure freshness (shared)" = _if `now - lastRefreshAt > REFRESH_INTERVAL`,
spawn a detached `ofocus changes --watch <W> --refresh-inline` and set `lastRefreshAt = now`._

**`SessionStart`** — session digest (surfacing):

1. Ensure freshness (shared).
2. Peek (non-draining): `ofocus changes --watch <W> --format json` → `pending` + `generation`.
3. If `generation > lastSeenGeneration` and `pending` is non-empty, format a concise digest from `changes`/`summary` (e.g. _"Since you were last here: 3 new inbox items, 1 newly overdue (Pay invoice), project 'Falcon' → on-hold."_) and emit it as `additionalContext`.
4. Set `lastSeenGeneration = generation`.

**`Stop`** — end-of-turn surface (the primary mid-conversation checkpoint; surfacing):

1. Peek (non-draining).
2. If `generation > lastSeenGeneration` and `pending` is non-empty, surface a concise _"changed while I worked"_ summary (same formatter as the digest) and set `lastSeenGeneration = generation`.
3. Ensure freshness (shared) so the next turn starts current.

Fires at a natural boundary (the agent has finished its turn), so it never interrupts work.
It catches changes that arrived mid-turn (via the shared background refresh) without the
agent having to poll.

**`PreToolUse`** — gated mid-turn interjection (silent unless one case fires):

1. Peek (non-draining): `pending` + `generation` (cheap; no OmniJS scan).
2. **Urgent case** — if `generation > lastSeenGeneration` **and** the new deltas contain an _urgent_ change (§4.3): inject a one-line urgent note immediately (don't make a time-sensitive item wait for turn end) and set `lastSeenGeneration = generation`.
3. **Soft-nudge case** — else if `generation > lastSeenGeneration` **and** `now - lastNudgedAt > NUDGE_INTERVAL` (long-run throttle): inject the soft nudge
   > 📥 OmniFocus changed (N items) since you last reviewed. If you don't already have a task to review the OmniFocus inbox/changes, add one to your task list to follow up when you finish your current work.
   > Set `lastNudgedAt = now`. **Do NOT advance `lastSeenGeneration`** — so the authoritative summary still arrives at the next `Stop`/`SessionStart`. The soft nudge is a _reminder_, not a delivery.
4. Ensure freshness (shared).

A brand-new session key has no stored cursor (treated as `-1`), so it gets the SessionStart
digest and is then surfaced/nudged only for changes that arrive _after_ it joined — exactly
"what's new for this agent."

### 4.3 Urgency classification (deterministic, from the peeked deltas)

Urgency is computed by the hook from the `changes.changes` delta fields — no model, no
reasoning (compute-don't-reason). A changed object is **urgent** when any of:

- a task's `dueDate` delta crosses into **overdue or due-today** (new due ≤ end of today);
- a task is **newly flagged** (`flagged` `false → true`);
- _(optional, configurable)_ a task **gains the configured agent tag** (`OFOCUS_ASSISTANT_AGENT_TAG`), i.e. the human explicitly routed it to the agent.

Everything else (added inbox items, note/project/defer edits, completions, removals) is
**non-urgent** — surfaced by the SessionStart/Stop digests and the occasional soft nudge,
never as an immediate interjection. Thresholds are configurable (§4.5). The classifier is a
pure function over the delta list and is unit-tested (§6).

### 4.4 Why this is correct and low-noise

- **Surfacing is idempotent and per-session.** A session is brought up to date at most once per generation by SessionStart/Stop/urgent-PreToolUse (`lastSeenGeneration`), so it is never re-told the same change. Session A advancing its cursor never affects session B.
- **The soft nudge is throttled and non-advancing** — at most once per `NUDGE_INTERVAL` on long runs, and it does not consume the change (the turn-end summary still delivers it). The _"if you don't already have a task"_ clause is applied by the **agent** (which can see its own task list); the hook delegates that judgment.
- **Urgent items jump the queue** but still only once (they advance the cursor).
- **Peek-without-drain** keeps shared state immutable from the hook, so the deltas remain for the agent to consume on its own schedule; multi-agent sessions can't clobber each other.
- The expensive OmniJS scan runs only on the shared debounced background refresh — never inline on a tool call or turn boundary.

### 4.5 Hook-local state (per-session) & configuration

State — a small JSON file, separate from the tool's watch cache, atomic temp+rename writes:

```
$OFOCUS_STATE_DIR/hook-state.json   (default $OFOCUS_STATE_DIR = ~/.ofocus)
{
  "<watch>": {
    "lastRefreshAt": "<ISO>",                       // shared debounce (per watch)
    "sessions": {
      "<session_key>": {
        "lastSeenGeneration": <n>,                  // advanced by surfacing events
        "lastNudgedAt": "<ISO>",                    // soft-nudge throttle
        "lastSeenAt": "<ISO>"                        // for GC
      }
    }
  }
}
```

- **Concurrent writes:** each write is a read-modify-write touching only _its own_ session entry (plus `lastRefreshAt`), written atomically (temp + rename). A rare lost update is self-healing — worst case a session is nudged/surfaced once more than necessary; nothing is silently dropped from OmniFocus.
- **GC:** prune `sessions` entries whose `lastSeenAt` is older than a window (default 7 days) on each write. (A future `SessionEnd` hook could prune immediately; deferred.)

Configuration (env):

- `OFOCUS_ASSISTANT_WATCH` — watch name (default `agent`).
- `OFOCUS_ASSISTANT_REFRESH_INTERVAL_MS` — shared background-refresh debounce (default `300000` / 5 min).
- `OFOCUS_ASSISTANT_NUDGE_INTERVAL_MS` — soft-nudge throttle (default `600000` / 10 min).
- `OFOCUS_ASSISTANT_URGENT_DUE_TODAY` — treat newly due-today (not just overdue) as urgent (default `true`).
- `OFOCUS_ASSISTANT_AGENT_TAG` — optional tag whose addition marks a change urgent (default unset).
- `OFOCUS_ASSISTANT_DISABLE` — if set, the hook no-ops (escape hatch).
- The `ofocus` CLI is located via `PATH`; if absent, the hook fails open (§4.7).

### 4.6 Hook output protocol — feasibility note

`SessionStart` reliably supports injecting `additionalContext`. **Whether `Stop` and
`PreToolUse` support surfacing context (`additionalContext` / `systemMessage`) must be
verified early in implementation** (via the `plugin-dev:hook-development` skill / current
Claude Code hook docs; see the §8.1 probe):

- **If `PreToolUse` can't inject context** → fall back to **`UserPromptSubmit`** for the mid-turn nudge/urgent path (fires once per user turn, definitely supports `additionalContext`).
- **If `Stop` can't surface to the user/next turn** → move the end-of-turn surface to **`UserPromptSubmit`** (start of the next turn). Either way the tiered model is identical; only the trigger boundary changes. These fallbacks are acceptable and pre-approved.

### 4.7 Error handling — fail-open and silent

A monitoring hook must never break the session. On any failure — `ofocus` not on PATH, non-zero exit, malformed JSON, OmniFocus not running, corrupt hook-state — the hook emits **no context** and exits 0. It never blocks a tool call or a turn. Background-refresh spawns are detached and their failures are ignored.

## 5. Component B — inbox-triage / co-planning skill

`skills/ofocus-triage/SKILL.md` — guidance (not code) the agent follows when the user asks to triage the inbox, plan, or review. Encodes the collaboration conventions:

- **Triage flow:** read the inbox (`ofocus tasks --in-inbox`), and for each item propose a disposition — project, tags, defer/due, flag, or "delete/drop" — then present the proposals as a **batch for the user's approval** before applying via `ofocus update` / `update-batch`. Never mutate without confirmation.
- **Co-planning:** break large/ambiguous tasks into subtasks (`ofocus subtask`); turn vague inbox notes into actionable next actions.
- **Review:** surface projects due for review (`ofocus projects-for-review`) and stalled work; mark reviewed (`ofocus review`).
- **Compute-don't-reason discipline:** for "what's due today / this week / what changed / workload," call the deterministic commands (`ofocus forecast`, `ofocus changes`, `ofocus stats`) rather than pulling raw task lists into context and reasoning over them. The skill explicitly points the agent at these.
- **Acting on a nudge:** when the agent has a self-created "review OmniFocus changes" task (from the hook nudge), it triages from **live state** — `ofocus tasks --in-inbox`, `--flagged`, `ofocus forecast` — rather than draining the shared delta log. (The shared watch's `--pending` drain is single-consumer and would clobber other concurrent sessions, so the multi-agent-safe path is to review current state; the nudge/surface is only the _signal_ that there's something to look at.)

The skill references the `ofocus` command surface (already documented in the generated `skills/ofocus/SKILL.md`) rather than restating it.

## 6. Testing

Per the project's multi-layer + spec-first conventions; a plugin is mostly config + a script + markdown.

- **Hook script unit tests (`notify.mjs`, vitest):** extract the pure logic into testable functions and assert:
  - **Digest formatting** — given a `changes` JSON payload, produces the expected human-readable summary (spec-derived strings, not snapshots).
  - **Urgency classifier** — newly-overdue, newly-due-today (when enabled), and newly-flagged deltas classify as _urgent_; added inbox items, edits, completions, and removals classify as _non-urgent_; the agent-tag rule fires only when configured.
  - **Per-session surfacing decision** — a session is surfaced iff `pending` non-empty **and** `generation > lastSeenGeneration`; not when unchanged (idempotency) or pending empty. **Multi-agent:** session A advancing its cursor does NOT silence session B (B with an older cursor still surfaces). (The core multi-agent test.)
  - **PreToolUse gating** — an _urgent_ delta interjects and advances `lastSeenGeneration`; a _non-urgent_ delta does not interject except as a soft nudge, and the soft nudge (a) respects `NUDGE_INTERVAL` and (b) does **not** advance `lastSeenGeneration` (so the next `Stop` still surfaces the authoritative summary).
  - **Per-session state isolation** — a read-modify-write for session A preserves session B's entry; GC prunes only entries older than the window.
  - **Debounce decision** — spawns refresh iff `now - lastRefreshAt > interval` (shared, not per-session).
  - **Session-key fallback chain** — derives the key from `session_id`, else `transcript_path`, else `"_shared"`; tested for all three payload shapes.
  - **Fail-open** — malformed/empty CLI output or a thrown error yields no injected context and no throw (a missing session id degrades to the `"_shared"` key, not a crash).
  - Inject a fake `ofocus` (a stub executable / mocked exec), a synthetic hook stdin payload (varying which identifier fields are present), and a temp `OFOCUS_STATE_DIR`; never touch real OmniFocus. Use a fixed injected `now` (no `Date.now()` in assertions).
- **Manifest validation:** validate `plugin.json` and `hooks.json` against the plugin schema (`plugin-dev:plugin-validator`).
- **Skill review:** run `plugin-dev:skill-reviewer` on `SKILL.md` for triggering quality and accuracy; verify every referenced command exists in the CLI.
- **Manual UAT** (not CI-automatable — loading a live plugin needs a Claude Code session; see `manual-test-design`): install the plugin, make an OmniFocus change, start a session → confirm the SessionStart digest; within a session, after a background refresh, finish a turn → confirm the end-of-turn surface; make an _urgent_ change (flag a task) → confirm the immediate PreToolUse interjection; make a _non-urgent_ change on a long run → confirm a single throttled soft nudge and that the agent self-schedules a review task. Document these steps in the plugin README.

## 7. File responsibilities (for the plan)

| File                                                    | Responsibility                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin/ofocus-assistant/.claude-plugin/plugin.json`    | Manifest: identity fields only (name/version/description/author). `hooks/hooks.json` and `skills/*/SKILL.md` are auto-discovered by Claude Code from the plugin root — no manifest linkage needed. |
| `plugin/ofocus-assistant/hooks/hooks.json`              | Binds `SessionStart`, `Stop`, and `PreToolUse` (or the §4.6 fallbacks) to `notify.mjs <event>`.                                                              |
| `plugin/ofocus-assistant/hooks/notify.mjs`              | The hook: peek / digest / end-of-turn surface / urgency-gated interjection / soft nudge / debounced refresh + fail-open. Pure logic factored for unit tests. |
| `plugin/ofocus-assistant/skills/ofocus-triage/SKILL.md` | Triage / co-planning guidance.                                                                                                                               |
| `plugin/ofocus-assistant/README.md`                     | What it is, install, config env vars, the manual UAT steps.                                                                                                  |
| `plugin/ofocus-assistant/tests/lib.test.mjs`            | Unit tests for the hook's pure logic (session key, surface/urgency/soft-nudge decisions, per-session state + GC, formatting).                                |
| `plugin/ofocus-assistant/tests/notify.test.mjs`         | Subprocess/integration tests for the hook entry against a stub `ofocus`.                                                                                      |

## 8. Open implementation questions (resolve during planning, not blocking design)

1. **Probe the hook payload (do this FIRST).** Add a throwaway hook that writes its raw stdin to a file, trigger it on each event, and confirm: (a) which events carry `session_id` and/or `transcript_path` and the exact field names, and (b) whether `Stop` and `PreToolUse` support injecting `additionalContext` (or need the §4.6 `UserPromptSubmit` fallback). This single probe resolves both the session-key chain (§4.1) and the injection mechanism (§4.6). Do not write the real hook until this is confirmed.
2. **Hook-state write concurrency** — confirm atomic temp+rename read-modify-write is sufficient under realistic concurrency; decide whether a lightweight lockfile is worth it (current decision: no — accept rare self-healing lost updates, §4.5).
3. **Hook test runner wiring** — whether the plugin's `notify.test.ts` runs under the repo's existing vitest setup or a small standalone config (the plugin is outside the `packages/*` workspace).
4. **`ofocus` binary name** — the installed CLI bin is `ofocus-cli`; the umbrella `ofocus` package provides `ofocus`. Confirm which the hook should invoke (prefer `ofocus`, fall back to `ofocus-cli`).
5. **Plugin discovery** — whether to add a `.claude-plugin/marketplace.json` now for installability, or defer (currently deferred, §2).
