# A1 — The `ofocus changes` Change-Detection Primitive

**Date:** 2026-05-30
**Status:** Design — pending review
**Layer:** **L2 — Productivity nicety.** A1 is the **first inhabitant of the new
`@ofocus/productivity` package** and establishes it (see principles doc §Package
architecture). Surfaced through `@ofocus/cli` + `@ofocus/mcp`. The change-notification *hook*
that consumes this is **L3** (the plugin) and is out of scope here (§11).
**North star:** [OFocus Agent Collaboration — Design Principles](./2026-05-30-ofocus-agent-principles.md)
(realizes patterns **1 — Compute, don't reason** and **4 — Push state, don't poll-and-diff**)

---

## 1. Goal

Let an agent (or any script) routinely ask *"what changed since I last looked?"* and get:

- an **instant** answer (cache-first read, no inline OmniJS scan),
- a cheap **"nothing changed"** short-circuit,
- when something did change, **field-level deltas** plus the full current object, so the
  agent never computes a diff or tracks timestamps itself.

The tool owns all bookkeeping: the snapshot, the diff, and *what the agent has already
seen*. The agent's only contract is a **watch name**.

## 2. Findings that shape the design (empirically verified against OmniFocus 4, build 185.15)

- **`task.modified`, `tag.modified`, `folder.modified` return real timestamps.** True
  incremental detection is feasible without content hashing.
  - `project.modified` is `undefined` on the root project object — use
    `project.task.modified`. (Resolve concretely in implementation.)
- **No O(1) global change token.** `Database.version` is `undefined`; the `Database`
  object exposes nothing transaction-like.
- **The on-disk DB mtime is gated by macOS TCC.** The OmniFocus 4 container
  (`~/Library/Containers/com.omnigroup.OmniFocus4/Data/...`) is unreadable from the
  CLI/agent context without Full Disk Access (FDA). The only universally-available bridge
  is OmniJS via `osascript`.
- **Reading `.modified` is not free:** a timestamp-only scan over 717 objects took ~924ms.
  So a fast path is worth having, but it must go through OmniJS unless FDA is granted.
- **`document.lastSyncDate` is available** and can be folded into the fingerprint so a sync
  that pulls in remote changes is detected.
- Reference DB scale (this machine): 691 tasks, 59 projects, 10 tags, 16 folders;
  44 tasks modified in the last 24h. Full scans are sub-second at this scale.

## 3. The three read modes

```
ofocus changes --watch <name>                  # cached read: instant, eventually consistent;
                                               #   triggers a debounced background refresh
ofocus changes --watch <name> --fresh          # synchronous live read: scan now, diff,
                                               #   update cache, CLEAR pending, return live changes
ofocus changes --watch <name> --pending [-g G] # machine path (for the plugin hook): deltas
                                               #   with generation > G; advances deliveredGeneration
ofocus changes --watch <name> --reset          # re-baseline to current; new cursor, no diff
ofocus changes --watch <name> --since <cursor> # optimistic stateless check → notModified fast
ofocus changes --watch <name> [task filters]   # define / redefine the watch's scope (first run)
ofocus changes --watch <name> --semantic       # attach a fast-model NL summary (opt-in; see §8)
```

The watch **name** is the entire contract for an agent. `--since` is optional sugar for
stateless callers. `--fresh` is the "I need certainty now" override.

## 4. Architecture

### 4.1 Layers

| Concern | Package | Notes |
| --- | --- | --- |
| Diff engine, fingerprint, snapshot model, `generation`/pending accounting | `@ofocus/productivity` | Pure, spec-testable; Node built-ins only |
| OmniJS scan (read watched objects + fingerprint) | `@ofocus/productivity` | via `@ofocus/sdk`'s `runOmniJSWrapped` |
| Snapshot persistence (read/write cache files, locking) | `@ofocus/productivity` | Node `fs`/`path` only |
| Detached background-refresh spawn + `--semantic` summary helper | `@ofocus/productivity` | Node `child_process`; loose dependency, fail-open (§8); shared so CLI **and** MCP inherit it |
| Command wiring (`defineCommand` descriptor) | descriptor defined in `@ofocus/productivity`, using `defineCommand` imported from `@ofocus/sdk` | Auto-derives CLI + MCP + docs |

A1 **establishes `@ofocus/productivity`** (new package; depends on `@ofocus/sdk`). The
command descriptor is defined there using `defineCommand` from `@ofocus/sdk`; the CLI and MCP
compose the union of the core and productivity registries, so `changes` surfaces in the CLI,
the MCP server, and the generated agent docs automatically — same pattern as every other
command. `@ofocus/sdk` stays zero-dependency; the spawning/summary glue lives in
`@ofocus/productivity` via Node built-ins.

**Scaffolding A1 must add:** `packages/productivity/` (package.json, tsconfig project ref,
vitest config), wire it into the workspace, make `@ofocus/cli` and `@ofocus/mcp` depend on it
and merge its registry, and re-export it from the `ofocus` umbrella.

### 4.2 The fingerprint fast path

A cheap fingerprint per watched object class lets us short-circuit without serializing
every object:

```jsonc
"fingerprint": {
  "tasks":    { "count": 691, "maxModified": "2026-05-30T01:08:36.529Z" },
  "projects": { "count": 59,  "maxModified": "…" },
  "lastSyncDate": "…"            // document.lastSyncDate, folded in
  // "dbMtime": "…"              // present only when the FDA accelerator is active (§4.4)
}
```

`{count, maxModified}` per class catches every case:
- **edit** → `maxModified` advances (OmniFocus bumps `modified` on every edit),
- **add** → `count` rises (and `maxModified`),
- **delete** → `count` falls,
- the only theoretical miss — delete-one-old + add-one in the same interval with identical
  count — is still caught because the added item's `modified` is newer than the cursor.

### 4.3 Read flow

```
ofocus changes --watch X
  1. load cache file for X (O(1)); if absent → first-run baseline (see §6)
  2. return cache.snapshot-derived state IMMEDIATELY  (instant; eventually consistent)
  3. spawn a debounced, single-flight background refresh (§4.5) and return

ofocus changes --watch X --fresh
  1. compute current fingerprint (one OmniJS call; or FDA mtime check first, §4.4)
  2. if fingerprint == cache.fingerprint → { notModified: true, cursor }   (snapshot untouched)
  3. else: full scan of watched scope → diff vs cache.snapshot →
           write new snapshot + fingerprint, CLEAR pending, return live changes + new cursor

background refresh (same scan/diff core as --fresh, but):
  - on change: APPEND deltas to cache.pending, bump cache.generation
  - never returns to a caller; only mutates the cache
```

### 4.4 Optional Full Disk Access accelerator

If FDA is granted and the `.ofocus` package is readable, the refresher (and potentially the
plugin hook) `stat`s the package directory mtime first and **skips the OmniJS scan entirely
when unchanged** — cheap enough to run on every hook fire.

- **With FDA:** mtime is the fast path; `dbMtime` joins the fingerprint.
- **Without FDA:** automatic fallback to the `{count, maxModified}` OmniJS fingerprint.
- **FDA is never required.** A setup affordance (e.g. `ofocus doctor` / documented
  instructions) explains *why* and *how* to grant it; absence degrades gracefully.

### 4.5 Background refresh — debounced, single-flight (no daemon in v1)

A cached read spawns a **detached** refresh process, guarded by a lock in the cache file:

```jsonc
"refreshLock": { "pid": 12345, "startedAt": "2026-05-30T01:08:40Z" }
```

- Single-flight: if a non-stale lock is held, the new read does not spawn another refresh.
- Debounce: skip spawning if the last completed refresh is younger than a threshold
  (e.g. configurable `OFOCUS_REFRESH_MIN_INTERVAL`, default a few seconds).
- Stale-lock recovery: a lock older than a ceiling (or whose pid is dead) is reclaimed.

A long-lived / launchd daemon (refresh while no agent is active, truly O(1) checks) is an
explicit later optimization on this same interface — out of scope for v1.

## 5. Cache file format

`~/.ofocus/watch/<name>.json` (default; directory created on demand):

```jsonc
{
  "version": 1,
  "name": "inbox",
  "scope": { /* the task filters that define this watch; empty = tasks+projects default */ },
  "classes": ["tasks", "projects"],          // default; tags/folders opt-in
  "fingerprint": { /* §4.2 */ },
  "snapshot": {                               // keyed by id → watched field values
    "kf3…": { "name": "…", "flagged": false, "dueDate": null, /* … */ }
  },
  "generation": 7,                            // bumped by each refresh that finds changes
  "deliveredGeneration": 7,                   // last surfaced to the agent via --pending
  "pending": { "added": [], "updated": [], "removed": [] },  // accumulates until delivered/cleared
  "semanticByGeneration": { "7": "…cached summary…" },       // §8
  "refreshLock": null,
  "updatedAt": "2026-05-30T01:08:40Z"
}
```

**The cache is monitoring state only — never a source of truth for mutations.** Completing,
deferring, editing tasks always goes through the live commands, so there is no staleness
risk on writes.

## 6. Output contract

TOON by default (matching the tool convention); `--format json` for standard JSON.

```jsonc
{
  "watch": "inbox",
  "generation": 8,
  "cursor": "<opaque; encodes the fingerprint>",
  "notModified": false,
  "stale": true,                 // true on a cache-first read with a refresh in flight
  "summary": { "added": 1, "updated": 2, "removed": 0 },
  "changes": {
    "added":   [ { "id": "…", "object": { /* full current representation */ } } ],
    "updated": [ {
      "id": "kf3…",
      "object": { /* full current representation — no re-fetch needed */ },
      "delta":  { "dueDate": { "from": "2026-06-02", "to": "2026-05-30" },
                  "flagged": { "from": false, "to": true } }
    } ],
    "removed": [ { "id": "…", "object": { /* last-known representation */ } } ]
  },
  "semanticSummary": "…"          // present only with --semantic (§8)
}
```

- **First run** (no cache): baseline silently and return `{ generation: 1, summary: all-zero,
  changes: empty }` with `baselined: true` — *not* every object as "added" (avoids a
  spurious full dump). `--reset` behaves the same on an existing watch.
- Each changed object carries **both** the full current `object` and the field-level
  `delta`. The agent reads whichever it needs; it never reconstructs state.

## 7. Watch scope

- **Default classes:** `tasks` + `projects` (inbox items are tasks; the alerting-relevant
  classes). `tags` / `folders` opt-in via flag.
- **Scope filters:** reuse the existing task-query filter vocabulary (`--project`, `--tag`,
  `--flagged`, `--available`, …) so a watch can track a slice (e.g. one project). The scope
  is stored with the watch and reused on every poll; re-passing filters redefines it
  (and re-baselines).
- **Watched fields:** a fixed, documented set per class (the fields whose changes matter for
  alerting: name, note, flagged, due/defer/completion dates, project, tags, status,
  estimatedMinutes). Changes to unwatched fields do not produce deltas. (Field set is part
  of the spec surface and spec-tested.)

## 8. `--semantic` — optional summary via a loose dependency

A user-configured command turns the deterministic diff into a one-paragraph NL summary. No
SDK dependency; pure `child_process` in `@ofocus/productivity` (so CLI and MCP both inherit
it), never in `@ofocus/sdk`.

```
OFOCUS_SUMMARY_CMD='claude -p "Summarize these OmniFocus changes in 2 sentences"'
# or: llm -m claude-haiku | ollama run llama3 | any CLI that reads stdin → writes stdout
```

- Diff packet (JSON) is piped to the command **on stdin** (never argv — avoids
  escaping/length/injection).
- stdout is captured as `semanticSummary` and **cached by `generation`**
  (`semanticByGeneration`) so a given diff is summarized at most once.
- **Fail-open:** unconfigured / missing binary / non-zero exit / timeout → return the
  structured diff with a `summaryNote`, never fail the command.
- **Presentation, never truth:** the summary never feeds the fingerprint, snapshot, or
  `generation`. The deterministic diff is canonical.
- **Trust model:** identical to `eval` — a user-configured command running locally.
  Documented as such.

## 9. Error handling

Reuse `CliError` / `ErrorCode` and the `success`/`failure` result helpers.

| Situation | Behavior |
| --- | --- |
| OmniFocus not running | Existing connection-error path (from `runOmniJSWrapped`) |
| Missing cache | First-run baseline (§6) |
| Corrupt cache file | Treat as first run; back up the corrupt file alongside (e.g. `<name>.corrupt-<ts>.json`); warn |
| Cursor (`--since`) mismatch vs current | Proceed as a normal changed read |
| Refresh lock held / stale | Single-flight / stale-lock recovery (§4.5) |
| `--semantic` command fails | Fail-open (§8) |

## 10. Testing strategy

Per the project's multi-layer + spec-first conventions. **No snapshot-as-truth / golden
files** — every assertion traces to this spec.

- **Unit (`@ofocus/productivity`, vitest):** the diff engine against hand-built fixture snapshots —
  added / updated (with exact field deltas) / removed; fingerprint equality and each change
  class (edit/add/delete + the add+delete-same-interval edge); first-run baseline produces
  empty changes (not all-added); watched-vs-unwatched field changes. Negative: corrupt cache
  recovery, empty DB, `--since` mismatch.
- **Integration:** CLI → SDK wiring through the descriptor registry; cache file written and
  re-read across invocations; **the push loop simulated** — a background-refresh pass
  appends pending + bumps `generation`, then `--pending -g G` returns exactly the addendum
  and advances `deliveredGeneration` (proves pattern 4 end-to-end without the plugin hook,
  which ships in B).
- **UAT:** real `ofocus changes` CLI against a temp `--state-dir`, exercising the three read
  modes and `--reset`; assert exit codes and output shape as an agent/script would see them.
  The `--semantic` path tested with a stub command (e.g. `cat`/`printf`) to verify wiring
  and fail-open, with no assertion on prose.
- **FDA accelerator:** unit-test the mtime-vs-fingerprint decision with the filesystem
  layer mocked (the real FDA path is environment-dependent and documented as manual).

## 11. Out of scope for A1

- The PreToolUse change-notification **hook** (ships in the plugin, layer B; A1 provides the
  `--pending` query it consumes and documents the contract).
- A long-lived / launchd daemon (later optimization, §4.5).
- Temporal computation, derived state, fuzzy resolution (capabilities A2 / A3 / A4).

## 12. Open implementation questions (resolve during planning, not blocking design)

1. `project.modified` workaround — confirm `project.task.modified` is correct and stable.
2. Exact debounce default and stale-lock ceiling values.
3. Whether `Database.Fetch` (observed on the `Database` object) supports a native
   `modified > since` predicate that could make the changed-set scan faster than JS
   iteration — an optimization, not a design dependency.
4. Cursor encoding (opaque base64 of the fingerprint vs a readable composite string).
