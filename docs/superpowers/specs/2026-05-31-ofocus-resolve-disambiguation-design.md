# A4a — Fuzzy Resolution & Disambiguation (`ofocus resolve`)

**Date:** 2026-05-31
**Status:** Design — pending review
**Layer:** **L2 — Productivity nicety** (`@ofocus/productivity`; surfaced through `@ofocus/cli` + `@ofocus/mcp`). `@ofocus/sdk` unchanged.
**North star:** [OFocus Agent Collaboration — Design Principles](./2026-05-30-ofocus-agent-principles.md) — realizes **pattern 2, "resolve, don't dump"** (and pattern 3, "anchor, don't compute-in-head", via temporal anchors).
**Builds on:** A2 temporal engine (`scanRepeatingTasks`, `parseRRule`, `expandOccurrences`) and the existing entity queries.

---

## 1. Goal

Let an agent (or a human at a terminal) pass a **fuzzy reference** — "Project Falcon", "the scalability epic", "next stand-up" — and get back either a confidently **resolved** entity or a **tight ranked candidate set** to disambiguate, instead of a wall of rows to reason over. This is the "resolve, don't dump" pattern: minimal data flows through the agent, and matching is deterministic so correctness doesn't depend on the model.

Today the tool offers substring `search` and `nameContains/Starts/Equals/Regex` filters but **no fuzzy or ranked matching and no scoring** — so this is genuinely new.

## 2. Scope

**In scope (v1):**
- A pure, deterministic, zero-dependency **ranking engine**.
- The **disambiguation contract** (resolved / ambiguous / none) as reusable types.
- An **`ofocus resolve`** command over OmniFocus entities (project / task / tag / folder).
- **Temporal-anchor resolution** (`--kind temporal-anchor`): fuzzy-match a repeating task and return its next occurrence (via A2).

**Out of scope (deferred):**
- **Anchored create** (`ofocus add "…" --defer-anchor <ref>`) — a follow-on; depends on the create path and (for calendar anchors) agent-supplied dates.
- **Calendar access / task↔event linkage** — that is A4b; `ofocus` never reads a calendar. A `temporal-anchor` that matches nothing in OmniFocus returns `none` with an explicit hint that it may be a calendar event the agent should resolve via its own calendar tool.
- Fuzzy matching on notes (v1 ranks on entity **name**; `context` is shown but not scored).

## 3. Architecture

All in `@ofocus/productivity` (L2). The candidate sets come from the **existing SDK entity queries** (and A2's repeating-task scan) — `resolve` ranks them **in-process** and classifies; no new OmniJS for entity resolution.

### 3.1 Pure ranking engine — `src/resolve/rank.ts`
- **`score(query: string, name: string): number`** → `0..1`. Multi-signal, case-insensitive, whitespace-normalized (trim + collapse). Signals are combined as a straight **maximum** — the single best-matching signal wins (no blending):
  - **exact** (normalized equality) → `1.0`
  - **prefix** (name starts with query) → high
  - **substring** (query appears in name) → medium-high
  - **token-subsequence** — every query token matches a name token (prefix match), order-independent ("falcon scalability" matches "Scalability — Falcon") → medium-high scaled by coverage
  - **edit-distance (per-token, coverage-gated)** — fires only when **every** query token closely matches (normalized Levenshtein similarity ≥ 0.8) some name token; the signal is the average of those per-token best similarities × 0.85. This catches typos like "falcn" → "falcon" inside "Project Falcon" while avoiding false positives from a single coincidentally-overlapping token (e.g. "call mom" vs "Tall Mom Jeans"). (A whole-string Levenshtein was tried first but produced those false positives.)
  - **acronym/initialism** — query letters match the leading letters of consecutive name tokens ("PF" → **P**roject **F**alcon) → medium
  - Empty query → `0`.
- **`rankCandidates<T extends {name:string}>(query, items, opts): Scored<T>[]`** — score each item, sort descending (stable; tie-break by shorter name then name asc for determinism), drop below a floor, take top `opts.limit`.
- **`classify<T>(scored, thresholds): DisambiguationResult<T>`** (§3.2 shape):
  - **resolved** iff `top.score ≥ T_high` AND (only one scored candidate OR `top.score − second.score ≥ margin`).
  - else **ambiguous** iff at least one candidate `≥ T_low` → return up to `N` candidates `≥ T_low`.
  - else **none** → `suggestions` = up to a few highest below `T_low` (may be empty).
- **Tunable defaults** (module consts): `T_high = 0.85`, `margin = 0.15`, `T_low = 0.4`, `N = 5`.

### 3.2 Disambiguation contract — `src/resolve/types.ts`
```ts
export interface ResolveCandidate {
  id: string;
  name: string;
  kind: "project" | "task" | "tag" | "folder";
  context?: string;        // folder path (project), project/folder (task), parent (tag)
  score: number;           // 0..1, rounded to 2dp
}
export type DisambiguationResult<T extends { score: number }> =
  | { status: "resolved"; resolved: T; confidence: "high" }
  | { status: "ambiguous"; candidates: T[] }
  | { status: "none"; suggestions: T[]; note?: string };
```

### 3.3 `resolve` command — `src/commands/resolve.ts`
`ofocus resolve <query> [--kind project|task|tag|folder|temporal-anchor|any] [--limit N=5]`
- Default `--kind` = `project`; `any` = the union of `project` + `task` (each candidate carries its `kind`); `tag`/`folder` only when explicitly requested.
- **Entity kinds:** fetch the entity set via the existing query (`queryProjects` / `queryTasks` / `queryTags` / `queryFolders`), map each to `{ id, name, kind, context }`, `rankCandidates` → `classify` → contract.
- **`temporal-anchor`:** fetch repeating tasks (A2 `scanRepeatingTasks`), rank by name. On **resolved**, additionally compute the next occurrence via A2 (`parseRRule` + `expandOccurrences`, anchored on due/defer per the task) and attach it: `resolved: { …candidate, nextOccurrence: string | null, occurrences?: string[] }`. On **none**, set `note` to flag that the anchor matched no repeating OmniFocus task and may be a **calendar event** the agent should resolve with its own calendar tool.
- Handler takes injected deps (the entity fetchers + the A2 helpers + the scorer) so the logic is unit-testable without OmniFocus, mirroring A1/A2 command patterns.
- Descriptor via `defineCommand` (name `resolve`, cliName `resolve`, mcpName `resolve`, positional `["query"]`, `inputSchema` with `query`, `kind` enum (optional, default project), `limit` optional positive int).

### 3.4 Surfacing & reuse
- Add `resolveDescriptor` to `productivityDescriptors` (`src/index.ts`); add `register­CliCommand` in `packages/cli/src/cli.ts`; add `"resolve"` to `PRODUCTIVITY_TOOLS` in the MCP fixture; regenerate agent docs (`pnpm build`). MCP/catalog/docs otherwise auto-include it.
- Reuses: SDK entity queries, A2 (`scanRepeatingTasks`/`parseRRule`/`expandOccurrences`), `defineCommand`, `success`/`failure`/`ErrorCode`. **No new SDK surface; no calendar; no new dependency.**

## 4. Error handling
Reuse `CliError`/`ErrorCode`. Empty/whitespace query → `VALIDATION_ERROR`. A failed underlying entity query → propagate its failure. OmniFocus not running → existing connection-error path. Unparseable repeating rule (temporal-anchor) → that task simply scores but contributes no `nextOccurrence` (resolved still returns the entity with `nextOccurrence: null`).

## 5. Testing (spec-first, multi-layer; no snapshots)
- **Unit — `score`:** each signal independently — exact, prefix, substring, token-subsequence (word-order-independent), typo via edit-distance ("Falcn"→"Falcon"), acronym ("PF"→"Project Falcon"); case-insensitivity; empty query → 0; monotonicity sanity (a closer match scores higher than a worse one). Hand-assert representative scores/orderings (assert relative ordering + threshold bucketing rather than brittle exact decimals where the exact value isn't spec-meaningful).
- **Unit — `classify`:** boundary tests — single strong match → resolved; two strong within `margin` → ambiguous; clear winner beyond `margin` → resolved; all weak → none (+ suggestions); nothing → none (empty suggestions). Drive with synthetic scored arrays so thresholds are exercised precisely.
- **Unit — `resolve` handler:** injected entity fetchers + scorer + (for temporal) injected repeating-task set & A2 helpers; assert the contract shape per case, `context` population per kind, `any` kind union, and the temporal-anchor `none` calendar-hint note. Negative: empty query → failure; query failure propagates.
- **UAT (live, auto-skip without OmniFocus):** `ofocus resolve "<a real project name fragment>" --kind project` → resolved or ambiguous with sensible candidates; a deliberately fuzzy/typo query still surfaces the right project among candidates; `--kind temporal-anchor "<a real repeating task fragment>"` returns a `nextOccurrence`. Shape/sanity assertions (live data varies), not fixed values.

## 6. File structure
```
packages/productivity/src/resolve/
  rank.ts          # score, rankCandidates, classify (pure)
  types.ts         # ResolveCandidate, DisambiguationResult
packages/productivity/src/commands/
  resolve.ts       # resolveDescriptor + runResolve (entity + temporal-anchor)
packages/productivity/tests/unit/
  rank.test.ts, classify.test.ts, resolve.test.ts
packages/productivity/tests/uat/
  resolve.uat.test.ts
# wiring: src/index.ts, packages/cli/src/cli.ts, packages/mcp/tests/fixtures/expected-tools.ts, regenerated docs
```

## 7. Open implementation questions (resolve during planning; non-blocking)
1. Exact `context` derivation per kind (project → folder path; task → project name; tag → parent) — confirm available fields on the SDK query outputs (`OFProject.folderName`, `OFTask.projectName`, `OFTag.parentName`).
2. Whether `any` should also rank tags/folders (default: no — project+task only, to keep the candidate set focused).
3. Final weighting/threshold tuning against the real DB during the UAT (the defaults in §3.1 are a starting point).

## 8. Out of scope / roadmap
- **A4b** — calendar-conversance / task↔event linkage (agent-supplied events; `ofocus` models the link, never reads a calendar).
- **Anchored create** (`add … --defer-anchor`) — a small follow-on once `resolve` + temporal anchors exist.
